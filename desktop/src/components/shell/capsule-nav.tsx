import { Capsule, CapsuleItem } from "@ckpro/ui/components/capsule";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
	DropdownMenuTrigger,
} from "@ckpro/ui/components/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@ckpro/ui/components/tooltip";
import { useElementSize } from "@ckpro/ui/hooks/use-element-size";
import { cn } from "@ckpro/ui/lib/utils";
import {
	BookOpen,
	ChevronDown,
	ChevronsLeftRight,
	type LucideIcon,
	PanelLeft,
	Search,
	Settings,
} from "lucide-react";
import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ExamMenuItems } from "@/components/catalog/exam-list";
import { SHORTCUTS } from "@/shortcuts";
import { useAssistantEnabled, useSidebarLayout } from "@/stores/settings";
import { type Fit, fitCapsule, fitWidth, foldOrder, placeCapsule } from "./capsule-fit";
import { arrangeScreens } from "./sections";

/** The capsule's place in the window, which its surface takes the shape of */
export type CapsuleBox = { left: number; top: number; width: number; height: number };

const HEIGHT = 36;
const TOP = (48 - HEIGHT) / 2;
/** How near the pointer an icon starts to grow, and how much it grows */
const REACH = 70;
const GROWTH = 0.45;

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
 * it fits, else the Dock's way: icons that grow under the pointer, their
 * names in a tooltip, the least used folded into a menu
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

	// The names' width, from a copy laid out in full out of sight
	const [measure, { width: fullWidth }] = useElementSize<HTMLElement>();
	// Under the pointer it keeps its way, as the Dock does: a click that opens
	// a roomier screen does not turn the icons into names under the cursor;
	// they become names once the pointer leaves
	const [over, setOver] = useState(false);
	const held = useRef<Fit | null>(null);
	const fits = fitCapsule(fullWidth, items.length, right - left);
	const fit = over && held.current?.mode === "dock" && fits.mode === "full" ? held.current : fits;
	held.current = fit;
	const width = fitWidth(fit, fullWidth, items.length);
	const x = placeCapsule(window.innerWidth, left, right, width);
	const order = foldOrder(
		items.map(i => i.key),
		items.find(i => i.current)?.key
	);
	const folding = fit.mode === "dock" ? order.slice(0, items.length - fit.shown) : [];
	const shown = items.filter(i => !folding.includes(i.key));
	const inMenu = items.filter(i => folding.includes(i.key));

	useLayoutEffect(() => {
		if (fullWidth) onBox({ left: x, top: TOP, width, height: HEIGHT });
	}, [x, width, fullWidth, onBox]);

	// The Dock's magnification: an icon grows by how near the pointer is. Set
	// on the icons themselves, so nothing moves and a click keeps it
	const nav = useRef<HTMLElement>(null);
	const reduce = useRef(false);
	useEffect(() => {
		reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	}, []);
	const magnify = (x: number | null) => {
		for (const button of nav.current?.querySelectorAll<HTMLElement>("[data-dock]") ?? []) {
			const icon = button.querySelector<SVGElement>("svg");
			if (!icon) continue;
			const box = button.getBoundingClientRect();
			const near =
				x === null || reduce.current
					? 0
					: Math.max(0, 1 - Math.abs(x - (box.left + box.width / 2)) / REACH);
			icon.style.transform = near ? `scale(${(1 + GROWTH * near).toFixed(3)})` : "";
		}
	};

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
				onPointerMove={dock ? e => magnify(e.clientX) : undefined}
				onPointerLeave={() => {
					setOver(false);
					magnify(null);
				}}
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
						<Labelled label="More">
							<DropdownMenuTrigger asChild>
								<CapsuleItem data-dock aria-label="More" className={DOCK}>
									<ChevronsLeftRight />
								</CapsuleItem>
							</DropdownMenuTrigger>
						</Labelled>
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
		</>
	);
}

/** An icon of the Dock: square, the icon growing from its top */
const DOCK =
	"size-7 justify-center px-0 [&_svg]:size-4 [&_svg]:origin-top [&_svg]:transition-transform [&_svg]:duration-100";

function Destination({ item, dock }: { item: Item; dock: boolean }) {
	const Icon = item.icon;
	// The sidebar's button and search are icons in both ways
	const iconOnly = dock || item.key === "sidebar" || item.key === "search";
	const button = (
		<CapsuleItem
			data-dock={dock ? "" : undefined}
			current={item.current}
			aria-label={iconOnly ? item.label : undefined}
			onClick={item.exams ? undefined : item.go}
			className={iconOnly ? DOCK : undefined}
		>
			{iconOnly ? (
				<Icon />
			) : (
				<>
					{item.label}
					{item.exams && <ChevronDown />}
				</>
			)}
		</CapsuleItem>
	);
	const labelled = (child: ReactNode) =>
		iconOnly ? <Labelled label={item.label}>{child}</Labelled> : child;
	if (!item.exams) return labelled(button);
	return (
		<DropdownMenu>
			{labelled(<DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>)}
			<DropdownMenuContent align="center">
				<ExamMenuItems />
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

/** An icon's name, at once, under it: the Dock's label */
function Labelled({ label, children }: { label: string; children: ReactNode }) {
	return (
		<Tooltip delayDuration={0}>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent side="bottom">{label}</TooltipContent>
		</Tooltip>
	);
}
