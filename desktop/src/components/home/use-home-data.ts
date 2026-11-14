import { useEffect, useState } from "react";
import type { Unpassed } from "@/components/home/modules/in-progress";
import type { Measured } from "@/components/home/modules/readiness";
import {
	attemptDay,
	bestByDay,
	minutesByDay,
	plannedByDay,
	prepStart,
	retryList,
	scoreOf,
	suggestion,
	weakest,
	worked,
} from "@/components/study/data";
import { addDays, dayKey, monday, parseDay } from "@/days";
import { useExam } from "@/stores/exam";
import { useShownTargets, useTargets } from "@/stores/settings";
import { usePlans, useShownStudy, useStudy } from "@/stores/study";
import { examApi } from "@/tauri/api";
import { certName, domainName, plural } from "@/words";

/**
 * What Home shows, from the attempts and the plans of the exams shown and
 * each one's readiness: read again whenever Rust says the study changed.
 * Null while the attempts are read
 */
export function useHomeData() {
	const targets = useShownTargets();
	const aimed = useTargets();
	const catalog = useExam(s => s.catalog);
	const all = useStudy(s => s.history);
	const { history, ofShown } = useShownStudy();
	// Bumped when Rust says the study changed: the readiness is read again then
	const version = useStudy(s => s.version);
	const [retry, setRetry] = useState(0);

	const now = new Date();
	const today = dayKey(now);
	const weekStart = monday(now);
	// What is measured: the exams shown, else the latest attempt's certification
	const latest = all?.find(h => h.certification)?.certification || null;
	const certs = targets.length ? targets.map(t => t.certification) : latest ? [latest] : [];
	const certKey = certs.join(",");
	// The plans from this week to the last exam: the week, today and the map
	const from = dayKey(weekStart);
	const lastExam = [dayKey(addDays(weekStart, 6)), ...targets.map(t => t.date)]
		.sort()
		.at(-1) as string;
	const planned = usePlans(from, lastExam);
	const [measuredBy, setMeasuredBy] = useState<{ key: string; list: Measured[] }>({
		key: "",
		list: [],
	});
	// biome-ignore lint/correctness/useExhaustiveDependencies: a new version is the cue
	useEffect(() => {
		let current = true;
		const wanted = certKey ? certKey.split(",") : [];
		Promise.allSettled(wanted.map(c => examApi.readiness(c))).then(
			answers =>
				current &&
				setMeasuredBy({
					key: certKey,
					list: answers.map((a, i) => ({
						certification: wanted[i],
						readiness: a.status === "fulfilled" ? a.value : null,
						state: a.status === "fulfilled" ? "read" : "failed",
					})),
				})
		);
		return () => {
			current = false;
		};
	}, [certKey, version, retry]);
	/** Read the plans and the readiness again */
	const again = () => {
		setMeasuredBy({ key: "", list: [] });
		setRetry(n => n + 1);
		planned.reload();
	};

	if (all === null || history === null) return null;
	const plans = planned.plans && ofShown(planned.plans);
	const measured: Measured[] =
		measuredBy.key === certKey
			? measuredBy.list
			: certs.map(c => ({ certification: c, readiness: null, state: "reading" as const }));
	const minutes = minutesByDay(history);
	const days = new Set(history.filter(worked).map(attemptDay));
	const retries = retryList(history);
	// The exams tried and not passed yet, the latest first
	const unpassed: Unpassed[] = [...new Set(history.filter(worked).map(h => h.exam_id))]
		.map(id => {
			const tries = history.filter(h => h.exam_id === id && worked(h));
			return {
				examId: id,
				title: tries[0].title,
				best: Math.max(...tries.map(h => scoreOf(h))),
				pass: tries[0].pass_score,
			};
		})
		.filter(e => e.best < e.pass);
	const weekKeys = Array.from({ length: 7 }, (_, i) => dayKey(addDays(weekStart, i)));
	const weak = weakest(measured[0]?.readiness ?? null);
	// The longest exam of those shown: the full mock that measures every domain
	const mock = catalog
		.filter(e => certs.includes(e.certification))
		.reduce<(typeof catalog)[number] | null>(
			(m, e) => (!m || e.questions > m.questions ? e : m),
			null
		);
	const suggestions = [
		weak && `${domainName(weak.domain).replace(/^./, c => c.toUpperCase())} drill`,
		retries.length > 0 && `Retry ${plural(retries.length, "failed question")}`,
		targets[0] &&
			`Mock ${certName(targets[0].certification)} for ${parseDay(targets[0].date).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`,
	].filter((s): s is string => !!s);

	return {
		now,
		today,
		weekStart,
		targets,
		/** Several exams aimed at: each line says which */
		several: aimed.length > 1,
		/** No attempt yet, of any exam */
		fresh: all.length === 0,
		history,
		/** The plans read (null while they are, or when that failed) */
		plans,
		plansFailed: planned.failed,
		todayPlans: plans ? plans.filter(p => p.day === today) : null,
		weekPlans: plans ? plans.filter(p => weekKeys.includes(p.day)) : null,
		planDays: plannedByDay(plans ?? [], today),
		measured,
		minutes,
		best: bestByDay(history),
		/** The days practised */
		days,
		mapStart: parseDay(prepStart(targets, history, now)),
		retries,
		unpassed,
		weekAttempts: history.filter(h => weekKeys.includes(attemptDay(h))).length,
		mock,
		suggested: suggestion(catalog, history, certs[0] ?? null),
		suggestions,
		again,
	};
}
