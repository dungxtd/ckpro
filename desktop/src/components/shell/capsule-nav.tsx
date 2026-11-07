import { Capsule, CapsuleItem } from "@cktry/ui/components/capsule";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@cktry/ui/components/dropdown-menu";
import { IconButton } from "@cktry/ui/components/icon-button";
import { useElementSize } from "@cktry/ui/hooks/use-element-size";
import { cn } from "@cktry/ui/lib/utils";
import {
	BookOpen,
	ChevronDown,
	ChevronsLeftRight,
	type LucideIcon,
	PanelLeft,
	Search,
	Settings,
} from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ExamMenuItems } from "@/components/catalog/exam-list";
import { SHORTCUTS } from "@/shortcuts";
import { useAssistantEnabled, useSidebarLayout } from "@/stores/settings";
import {
	type DockMetrics,
	type Fit,
	fitCapsule,
	fitWidth,
	foldOrder,
	placeCapsule,
} from "./capsule-fit";
import { arrangeScreens } from "./sections";

/** The capsule's place in the window, which its surface takes the shape of */
export type CapsuleBox = { left: number; top: number; width: number; height: number };

const HEIGHT = 36;
const TOP = (48 - HEIGHT) / 2;

type Item = {
	key: string;
	label: string;
	icon: LucideIcon;
	current?: boolean;
	/** The exams' menu, instead of a destination */
	exams?: boolean;
	go: () => void;
};

/**
 * The screens, floating in the title bar while the sidebar is folded. It sits
 * in the window's middle and moves only as far as it must to clear
 * `[left, right]` (the window's buttons, an inspector); every name shows when
 * it fits, else the Dock's way: icons (the kit's icon buttons, growing under
 * the pointer, their names in tooltips), the least used folded into a menu
 */
export function CapsuleNav({
	folded,
	left,
	right,
	onUnfold,
	onSearch,
	onBox,
}: {
	folded: boolean;
	/** What it must not cover, in the window's pixels */
	left: number;
	right: number;
	onUnfold: () => void;
	onSearch: () => void;
	onBox: (box: CapsuleBox) => void;
}) {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const [layout] = useSidebarLayout();
	const assistant = useAssistantEnabled();
	const items: Item[] = [
		{
			key: "sidebar",
			label: `Show sidebar (${SHORTCUTS.sidebar.label})`,
			icon: PanelLeft,
			go: onUnfold,
		},
		...arrangeScreens(layout, { assistant }).map(s => ({
			key: s.path,
			label: s.label,
			icon: s.icon as LucideIcon,
			current: pathname === s.path,
			go: () => navigate(s.path),
		})),
		{
			key: "/exams",
			label: "Exams",
			icon: BookOpen,
			current: pathname === "/exams",
			exams: true,
			go: () => navigate("/exams"),
		},
		{
			key: "/settings",
			label: "Settings",
			icon: Settings,
			current: pathname.startsWith("/settings"),
			go: () => navigate("/settings"),
		},
		{ key: "search", label: "Search exams", icon: Search, go: onSearch },
	];

	// Its two ways' sizes, from copies laid out out of sight: the names in
	// full, and the icons (an icon's width, the gap and the padding)
	const [measure, { width: fullWidth }] = useElementSize<HTMLElement>({ border: true });
	const icons = useRef<HTMLElement>(null);
	const [metrics, setMetrics] = useState<DockMetrics>({ item: 0, gap: 0, pad: 0 });
	useLayoutEffect(() => {
		const el = icons.current;
		const first = el?.firstElementChild as HTMLElement | null | undefined;
		if (!el || !first) return;
		const style = getComputedStyle(el);
		setMetrics({
			item: first.offsetWidth,
			gap: Number.parseFloat(style.columnGap) || 0,
			pad: Number.parseFloat(style.paddingLeft) || 0,
		});
	}, []);
	// Under the pointer it keeps its way, as the Dock does: a click that opens
	// a roomier screen does not turn the icons into names under the cursor;
	// they become names once the pointer leaves
	const [over, setOver] = useState(false);
	const held = useRef<Fit | null>(null);
	const fits = fitCapsule(fullWidth, items.length, right - left, metrics);
	const fit = over && held.current?.mode === "dock" && fits.mode === "full" ? held.current : fits;
	held.current = fit;
	const width = fitWidth(fit, fullWidth, items.length, metrics);
	const x = placeCapsule(window.innerWidth, left, right, width);
	const order = foldOrder(
		items.map(i => i.key),
		items.find(i => i.current)?.key
	);
	const folding = fit.mode === "dock" ? order.slice(0, items.length - fit.shown) : [];
	const shown = items.filter(i => !folding.includes(i.key));
	const inMenu = items.filter(i => folding.includes(i.key));

	const nav = useRef<HTMLElement>(null);
	// The pill (the window's surface) takes the capsule's box as laid out,
	// not as estimated, so an item's hover never shows past its edge. A move
	// (x) or a new way (width) changes it without resizing it: read again
	// biome-ignore lint/correctness/useExhaustiveDependencies: x and width re-read the box
	useLayoutEffect(() => {
		const el = nav.current;
		if (!el || !fullWidth) return;
		const report = () => {
			const r = el.getBoundingClientRect();
			onBox({ left: r.left, top: r.top, width: r.width, height: r.height });
		};
		report();
		const watch = new ResizeObserver(report);
		watch.observe(el);
		return () => watch.disconnect();
	}, [x, width, fullWidth, onBox]);

	const dock = fit.mode === "dock";
	return (
		<>
			{/* Its pill is the window's morphing surface (main.tsx): only the
			    items fade, in as the surface reaches its shape, out as it leaves */}
			<Capsule
				ref={nav}
				aria-label="Screens"
				inert={!folded}
				onPointerEnter={() => setOver(true)}
				onPointerLeave={() => setOver(false)}
				style={{ left: x, top: TOP, height: HEIGHT }}
				className={cn(
					"fixed z-20 bg-transparent shadow-none backdrop-blur-none transition-opacity motion-reduce:transition-none",
					folded
						? "opacity-100 delay-200 duration-200"
						: "pointer-events-none opacity-0 duration-100"
				)}
			>
				{shown.map(item => (
					<Destination key={item.key} item={item} dock={dock} />
				))}
				{inMenu.length > 0 && (
					<DropdownMenu>
						<DropdownMenuTrigger asChild>
							<IconButton variant="capsule" size="bar" aria-label="More">
								<ChevronsLeftRight />
							</IconButton>
						</DropdownMenuTrigger>
						<DropdownMenuContent align="center">
							{inMenu.map(item => {
								const Icon = item.icon;
								return item.exams ? (
									<DropdownMenuSub key={item.key}>
										<DropdownMenuSubTrigger>
											<Icon /> Exams
										</DropdownMenuSubTrigger>
										<DropdownMenuSubContent>
											<ExamMenuItems />
										</DropdownMenuSubContent>
									</DropdownMenuSub>
								) : (
									<DropdownMenuItem key={item.key} onSelect={item.go}>
										<Icon /> {item.label}
									</DropdownMenuItem>
								);
							})}
						</DropdownMenuContent>
					</DropdownMenu>
				)}
			</Capsule>
			{/* The names in full, out of sight: how wide the capsule would be */}
			<Capsule
				ref={measure}
				aria-hidden
				inert
				className="pointer-events-none invisible fixed top-0 left-0"
			>
				{items.map(item => (
					<Destination key={item.key} item={item} dock={false} />
				))}
			</Capsule>
			{/* The icons, out of sight: an icon's width, the gap and the padding */}
			<Capsule
				ref={icons}
				aria-hidden
				inert
				className="pointer-events-none invisible fixed top-0 left-0"
			>
				{items.map(item => (
					<Destination key={item.key} item={item} dock />
				))}
			</Capsule>
		</>
	);
}

function Destination({ item, dock }: { item: Item; dock: boolean }) {
	const Icon = item.icon;
	// The sidebar's button and search are icons in both ways; in the Dock's
	// way every destination is: the kit's icon button, which grows under the
	// pointer and says its name in a tooltip
	const button =
		dock || item.key === "sidebar" || item.key === "search" ? (
			<IconButton
				variant="capsule"
				size="bar"
				aria-current={item.current ? "page" : undefined}
				aria-label={item.label}
				onClick={item.exams ? undefined : item.go}
			>
				<Icon />
			</IconButton>
		) : (
			<CapsuleItem current={item.current} onClick={item.exams ? undefined : item.go}>
				{item.label}
				{item.exams && <ChevronDown />}
			</CapsuleItem>
		);
	if (!item.exams) return button;
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
			<DropdownMenuContent align="center">
				<ExamMenuItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
