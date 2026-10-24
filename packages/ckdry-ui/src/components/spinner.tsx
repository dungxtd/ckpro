import { cn } from "@ckdry/ui/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import type React from "react";

const spinnerVariants = cva("flex-col items-center justify-center", {
	variants: {
		show: {
			true: "inline-flex",
			false: "hidden",
		},
	},
	defaultVariants: {
		show: true,
	},
});

const loaderVariants = cva("animate-spin text-primary", {
	variants: {
		size: {
			// In a line of text or a button, in the text's colour
			inline: "size-4 text-current",
			small: "size-6",
			medium: "size-8",
			large: "size-12",
		},
	},
	defaultVariants: {
		size: "medium",
	},
});

interface SpinnerContentProps
	extends VariantProps<typeof spinnerVariants>,
		VariantProps<typeof loaderVariants> {
	className?: string;
	children?: React.ReactNode;
}

export function Spinner({ size, show, children, className }: SpinnerContentProps) {
	return (
		<span className={spinnerVariants({ show })}>
			<Loader2 className={cn(loaderVariants({ size }), className)} />
			{children}
		</span>
	);
}
