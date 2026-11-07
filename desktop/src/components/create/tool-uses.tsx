import { CodeBlock } from "@ckpro/ui/components/code-block";
import { disclosureRow } from "@ckpro/ui/components/disclosure";
import { Spinner } from "@ckpro/ui/components/spinner";
import { useNow } from "@ckpro/ui/hooks/use-now";
import { cn } from "@ckpro/ui/lib/utils";
import { Check, ChevronRight, X } from "lucide-react";
import { useState } from "react";
import type { StudioTool } from "@/stores/studio";
import { plural } from "@/words";
import { QuestionScripts } from "./question-scripts";

/** Rows of a list shown as a table, at most */
const ROWS = 20;
/** Its columns, at most: the keys most of its rows have */
const COLUMNS = 5;

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

const parse = (text: string | null): Json | undefined => {
	if (!text) return undefined;
	try {
		return JSON.parse(text) as Json;
	} catch {
		return undefined;
	}
};
const isRecord = (v: Json | undefined): v is { [key: string]: Json } =>
	!!v && typeof v === "object" && !Array.isArray(v);
const scalar = (v: Json) => v === null || typeof v !== "object";
const show = (v: Json) =>
	v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v);

/** Its arguments in a line: their plain values */
function argsLine(input: string) {
	const args = parse(input);
	if (!isRecord(args)) return "";
	// A question's YAML: its title
	if (typeof args.yaml === "string") return /^title:\s*(.+)$/m.exec(args.yaml)?.[1] ?? "";
	return Object.values(args)
		.filter(v => scalar(v) && v !== null && v !== "")
		.map(v => (typeof v === "string" && v.length > 40 ? `${v.slice(0, 40)}…` : String(v)))
		.join(" · ");
}

/** What came back, in a word: a count, or that it failed */
function resultLine(tool: StudioTool) {
	if (tool.status === "failed") return "failed";
	const out = parse(tool.output);
	if (Array.isArray(out)) return plural(out.length, "result");
	if (isRecord(out)) {
		const list = Object.entries(out).find(([, v]) => Array.isArray(v));
		if (list && Array.isArray(list[1])) return `${list[1].length} ${list[0].replaceAll("_", " ")}`;
	}
	return "";
}

/**
 * The tools Claude used for an answer, as it uses them: each a line (its
 * name, its arguments, what came back, how long), opened in place to read
 * what it asked and what it got (lists as tables, the rest as code)
 */
export function ToolUses({ tools }: { tools: StudioTool[] }) {
	const [opened, setOpened] = useState<string | null>(null);
	if (tools.length === 0) return null;
	return (
		<div className="flex flex-col gap-0.5">
			{tools.map(tool => (
				<div key={tool.id}>
					<ToolLine
						tool={tool}
						open={opened === tool.id}
						onToggle={() => setOpened(o => (o === tool.id ? null : tool.id))}
					/>
					{opened === tool.id && <ToolDetail tool={tool} />}
				</div>
			))}
		</div>
	);
}

function ToolLine({
	tool,
	open,
	onToggle,
}: {
	tool: StudioTool;
	open: boolean;
	onToggle: () => void;
}) {
	const running = tool.status !== "completed" && tool.status !== "failed";
	const now = useNow(running, 500);
	const ms = tool.ms ?? (tool.since ? now - tool.since : null);
	const args = argsLine(tool.input);
	const result = running ? "" : resultLine(tool);
	return (
		<button
			type="button"
			aria-expanded={open}
			onClick={onToggle}
			className={cn(
				disclosureRow,
				"max-w-full py-0.5 text-caption text-muted-foreground hover:text-foreground",
				open && "bg-foreground/5 text-foreground"
			)}
		>
			{running ? (
				<Spinner size="inline" className="size-3 shrink-0 text-highlight" />
			) : tool.status === "failed" ? (
				<X className="size-3.5 shrink-0 text-destructive" />
			) : (
				<Check className="size-3.5 shrink-0 text-success" />
			)}
			<code className="shrink-0 font-mono text-foreground/85">{tool.name}</code>
			{args && <span className="min-w-0 truncate">{args}</span>}
			{result && (
				<span className={cn("shrink-0", tool.status === "failed" && "text-destructive")}>
					· {result}
				</span>
			)}
			{ms !== null && (
				<span className="shrink-0 tabular-nums opacity-70">{(ms / 1000).toFixed(1)}s</span>
			)}
			<ChevronRight className={cn("size-3 shrink-0 transition-transform", open && "rotate-90")} />
		</button>
	);
}

/** What it asked, and what it got: a list as a table, the rest as code */
function ToolDetail({ tool }: { tool: StudioTool }) {
	const args = parse(tool.input);
	const asked = isRecord(args) && Object.keys(args).length > 0;
	const out = parse(tool.output);
	// A question's YAML, asked or returned: read without its answer
	const proposed = isRecord(args) && typeof args.yaml === "string" ? args.yaml : null;
	const question =
		tool.name === "read_question" && tool.status === "completed" ? tool.output : null;
	return (
		<div className="my-1 ml-6 flex max-w-2xl flex-col gap-2 rounded-lg border border-border bg-card p-2.5">
			{asked && (
				<Section title="Asked">
					{proposed !== null ? (
						<QuestionScripts yaml={proposed} />
					) : (
						<CodeBlock title="json" wrap>
							{JSON.stringify(args, null, 2)}
						</CodeBlock>
					)}
				</Section>
			)}
			<Section title={tool.status === "failed" ? "Failed" : "Returned"}>
				{tool.output === null ? (
					<span className="text-caption text-muted-foreground">Nothing yet</span>
				) : question !== null ? (
					<QuestionScripts yaml={question} />
				) : (
					<Returned value={out} raw={tool.output} failed={tool.status === "failed"} />
				)}
			</Section>
		</div>
	);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
	return (
		<div className="flex flex-col gap-1">
			<span className="font-bold text-2xs text-muted-foreground tracking-wide">
				{title.toUpperCase()}
			</span>
			{children}
		</div>
	);
}

/** A list of records as a table; a record holding one as its fields and
 * that table; anything else as code */
function Returned({
	value,
	raw,
	failed,
}: {
	value: Json | undefined;
	raw: string;
	failed: boolean;
}) {
	if (failed || value === undefined)
		return (
			<CodeBlock
				title={failed ? "error" : "text"}
				wrap
				className={cn(failed && "text-destructive")}
			>
				{raw}
			</CodeBlock>
		);
	if (Array.isArray(value) && value.length > 0 && value.every(isRecord))
		return <Table rows={value as { [key: string]: Json }[]} />;
	if (isRecord(value)) {
		const fields = Object.entries(value).filter(([, v]) => scalar(v));
		const lists = Object.entries(value).filter(
			([, v]) => Array.isArray(v) && v.length > 0 && v.every(isRecord)
		);
		if (lists.length === 1 && fields.length + lists.length === Object.keys(value).length)
			return (
				<>
					{fields.length > 0 && <Fields fields={fields} />}
					<Table rows={lists[0][1] as { [key: string]: Json }[]} />
				</>
			);
	}
	return (
		<CodeBlock title="json" wrap>
			{JSON.stringify(value, null, 2)}
		</CodeBlock>
	);
}

function Fields({ fields }: { fields: [string, Json][] }) {
	return (
		<dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-caption">
			{fields.map(([k, v]) => (
				<div key={k} className="contents">
					<dt className="text-muted-foreground">{k.replaceAll("_", " ")}</dt>
					<dd className="min-w-0 truncate">{show(v)}</dd>
				</div>
			))}
		</dl>
	);
}

function Table({ rows }: { rows: { [key: string]: Json }[] }) {
	// The keys most rows have, plain values only
	const counts = new Map<string, number>();
	for (const row of rows)
		for (const [k, v] of Object.entries(row))
			if (scalar(v)) counts.set(k, (counts.get(k) ?? 0) + 1);
	const columns = [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, COLUMNS)
		.map(([k]) => k);
	return (
		<div className="overflow-x-auto">
			<table className="w-full text-caption">
				<thead>
					<tr>
						{columns.map(c => (
							<th
								key={c}
								className="border-border border-b px-1.5 py-1 text-left font-medium text-2xs text-muted-foreground"
							>
								{c.replaceAll("_", " ")}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{rows.slice(0, ROWS).map((row, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: a result's rows are fixed
						<tr key={i}>
							{columns.map(c => (
								<td key={c} className="max-w-48 truncate border-border/50 border-b px-1.5 py-1">
									{c in row ? show(row[c]) : ""}
								</td>
							))}
						</tr>
					))}
				</tbody>
			</table>
			{rows.length > ROWS && (
				<span className="text-2xs text-muted-foreground">and {rows.length - ROWS} more</span>
			)}
		</div>
	);
}
