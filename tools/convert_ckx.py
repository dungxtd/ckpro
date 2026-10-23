#!/usr/bin/env python3
"""One-off migration of CK-X labs to the ckdry lab format v1 (packs/core). Already
applied: packs/core is now the source of truth; kept for reference.

Faithful by design: CK-X verification scripts become `run` checks unchanged
(only 14 of 427 are simple enough for a declarative kind), setup scripts and
answers are carried over, and every guess (domain, title, solution commands)
is marked with `# review:` so a human or `ckdry lab verify` can confirm it.

Usage: python3 tools/convert_ckx.py [ck-x-exams-dir] [pack-dir]
"""

import json
import re
import sys
from pathlib import Path

LABS = Path(sys.argv[1] if len(sys.argv) > 1 else "../CK-X/facilitator/assets/exams")
PACK = Path(sys.argv[2] if len(sys.argv) > 2 else "packs/core")

CERTS = {"CKA": ["cka"], "CKAD": ["ckad"], "CKS": ["cks"]}
# Labs ckdry cannot run yet, and questions already converted by hand
SKIP_LABS = {"docker-001"}  # needs a Docker daemon on the candidate's machine
CURATED = {("cka-003", "1"): "core/cka/rbac-ci-token"}

# Concept keywords → curriculum domain, per certification (first match wins ties)
DOMAINS = {
    "cka": [
        ("troubleshooting", "troubleshoot debug logs events crashloop failing kubelet monitor metrics top broken"),
        ("storage", "pv pvc persistentvolume persistentvolumeclaim storageclass volume storage"),
        ("services-networking", "service ingress networkpolicy network-policy dns coredns gateway nodeport clusterip"),
        ("cluster-architecture", "rbac etcd kubeadm upgrade helm kustomize crd operator drain cordon serviceaccount clusterrole static"),
        ("workloads-scheduling", "deployment pod replica scaling scheduling affinity taint toleration nodeselector configmap secret hpa rollout daemonset statefulset priority limits resources"),
    ],
    "ckad": [
        ("application-observability-maintenance", "probe liveness readiness logs debug monitor deprecation troubleshoot"),
        ("services-networking", "service ingress networkpolicy network-policy dns"),
        ("application-deployment", "deployment rollout helm kustomize canary blue-green scaling strategy"),
        ("application-environment-configuration-security", "configmap secret serviceaccount securitycontext security-context resources limits quota rbac crd"),
        ("application-design-build", "pod multi-container sidecar init job cronjob image dockerfile volume"),
    ],
    "cks": [
        ("monitoring-logging-runtime-security", "audit falco runtime immutable"),
        ("supply-chain-security", "image dockerfile sbom trivy signing admission imagepolicy bom"),
        ("system-hardening", "apparmor seccomp kernel syscall"),
        ("cluster-hardening", "rbac serviceaccount upgrade api"),
        ("minimize-microservice-vulnerabilities", "securitycontext pod-security secret encryption runtimeclass gvisor mtls cilium"),
        ("cluster-setup", "networkpolicy network-policy cis kube-bench ingress tls metadata"),
    ],
}
DEFAULT_DOMAIN = {"cka": "cluster-architecture", "ckad": "application-design-build", "cks": "cluster-setup"}


def domain_for(cert, question):
    words = " ".join(question["concepts"] + [question["question"]]).lower()
    best, score = None, 0
    for domain, keywords in DOMAINS[cert]:
        hits = sum(1 for k in keywords.split() if re.search(rf"\b{re.escape(k)}", words))
        if hits > score:
            best, score = domain, hits
    return best or DEFAULT_DOMAIN[cert]


def script_body(path):
    """A CK-X script without the shebang and its trailing success echo."""
    lines = path.read_text().splitlines()
    if lines and lines[0].startswith("#!"):
        lines = lines[1:]
    body = "\n".join(lines).strip("\n")
    body = re.sub(r'\n?echo "Setup completed for Question \d+"\s*$', "", body)
    return body.strip("\n") + "\n" if body.strip() else ""


def answers(path):
    """Question number → (title, markdown, bash commands) from answers.md."""
    text = path.read_text() if path.exists() else ""
    sections = re.split(r"^## Question (\d+)[:.]?\s*(.*)$", text, flags=re.M)
    found = {}
    for i in range(1, len(sections) - 2, 3):
        number, title, body = sections[i], sections[i + 1].strip(), sections[i + 2].strip()
        commands = "\n".join(
            block.strip()
            for block in re.findall(r"```(?:bash|sh|shell)\n(.*?)```", body, flags=re.S)
        )
        found[number] = (title, body, commands)
    return found


def slug(text, limit=48):
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s[:limit].rstrip("-") or "question"


# --- tiny YAML emitter: literal blocks for multi-line text ---------------------------

PLAIN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9 ._/,()'-]*$")


def scalar(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if PLAIN.match(value) and value.lower() not in {"yes", "no", "true", "false", "null", "on", "off"} and not value.endswith(" "):
        return value
    return json.dumps(value)


def block(key, text, indent=0):
    pad = " " * indent
    if "\n" not in text.strip("\n"):
        return f"{pad}{key}: {scalar(text.strip())}\n"
    body = "".join(f"{pad}  {line}".rstrip() + "\n" for line in text.strip("\n").splitlines())
    return f"{pad}{key}: |\n{body}"


def question_yaml(q, lab, certs, title, setup, solution_md, solution_run, workers):
    out = [
        "# yaml-language-server: $schema=../../../schema/question.schema.json\n",
        f"# Converted from CK-X {lab['id']} question {q['id']}\n",
        f"title: {scalar(title)}\n",
        "certifications:  # review: domains guessed from concepts\n",
        *(f"  {cert}: {domain_for(cert, q)}\n" for cert in certs),
        f"difficulty: {lab['difficulty'].lower() if lab['difficulty'].lower() in ('easy', 'medium', 'hard') else 'medium'}\n",
    ]
    if workers != 1:
        out.append(f"workers: {workers}\n")
    if q.get("namespace"):
        out.append(f"namespace: {scalar(q['namespace'])}\n")
    if q.get("concepts"):
        out.append(f"tags: [{', '.join(scalar(c) for c in q['concepts'])}]\n")
    out.append("\n" + block("statement", q["question"]))
    if setup:
        out.append("\n" + block("setup", setup))
    out.append("\nchecks:\n")
    for v in q["verification"]:
        out.append(f"  - name: {scalar(v['description'])}\n")
        if int(v["weightage"]) != 1:
            out.append(f"    weight: {int(v['weightage'])}\n")
        out.append(block("run", script_body(lab["dir"] / "scripts/validation" / v["verificationScriptFile"]), 4))
    out.append("\nsolution:\n")
    out.append(block("explain", solution_md or "TODO: explain the solution", 2))
    out.append("  # review: commands extracted from the CK-X answer; `ckdry lab verify` confirms them\n")
    out.append(block("run", solution_run or "true  # TODO: commands that solve the task", 2))
    return "".join(out)


def main():
    catalog = json.loads((LABS / "labs.json").read_text())["labs"]
    exams = 0
    questions = 0
    for lab in catalog:
        if lab["id"] in SKIP_LABS:
            print(f"skip {lab['id']}: {lab.get('requires')}")
            continue
        lab["dir"] = LABS / lab["assetPath"]
        config = json.loads((lab["dir"] / "config.json").read_text())
        assessment = json.loads((lab["dir"] / "assessment.json").read_text())
        cert_list = CERTS.get(lab["category"], ["cka", "ckad"])  # helm lab fits both
        cert = cert_list[0]
        workers = int(config.get("workerNodes", 1))
        solutions = answers(lab["dir"] / "answers.md")

        ids = []
        for q in assessment["questions"]:
            curated = CURATED.get((lab["id"], q["id"]))
            if curated:
                ids.append(curated)
                continue
            title, solution_md, solution_run = solutions.get(q["id"], ("", "", ""))
            title = title or q["question"].split("\n")[0][:80]
            setup_file = lab["dir"] / f"scripts/setup/q{q['id']}_setup.sh"
            setup = script_body(setup_file) if setup_file.exists() else ""
            name = f"q{int(q['id']):02d}-{slug(title)}"
            target = PACK / "questions" / lab["id"] / f"{name}.yaml"
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(question_yaml(q, lab, cert_list, title, setup, solution_md, solution_run, workers))
            ids.append(f"core/{lab['id']}/{name}")
            questions += 1

        exam = PACK / "exams" / f"{lab['id']}.yaml"
        exam.parent.mkdir(parents=True, exist_ok=True)
        exam.write_text(
            "# yaml-language-server: $schema=../../schema/exam.schema.json\n"
            f"# Converted from CK-X {lab['id']}\n"
            f"title: {scalar(lab['name'])}\n"
            + block("description", lab["description"])
            + f"certification: {cert}\n"
            + f"duration: {int(lab['examDurationInMinutes'])}m\n"
            + "questions:\n"
            + "".join(f"  - {i}\n" for i in ids)
        )
        exams += 1
    print(f"converted {questions} questions into {exams} exams")


if __name__ == "__main__":
    main()
