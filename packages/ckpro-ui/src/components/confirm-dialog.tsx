import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@ckpro/ui/components/alert-dialog";
import { buttonVariants } from "@ckpro/ui/components/button";
import type { ReactNode } from "react";

/**
 * An action that cannot be undone (end an exam, delete a cluster), done only
 * once confirmed: `children` is the button that asks. Without one (asked
 * from a menu), `open` and `onOpenChange` show it
 */
export function ConfirmDialog({
	title,
	description,
	action,
	cancel = "Cancel",
	onConfirm,
	open,
	onOpenChange,
	children,
}: {
	title: string;
	description: string;
	/** The destructive button's label */
	action: string;
	cancel?: string;
	onConfirm: () => void;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	children?: ReactNode;
}) {
	return (
		<AlertDialog open={open} onOpenChange={onOpenChange}>
			{children && <AlertDialogTrigger asChild>{children}</AlertDialogTrigger>}
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>{title}</AlertDialogTitle>
					<AlertDialogDescription>{description}</AlertDialogDescription>
				</AlertDialogHeader>
				<AlertDialogFooter>
					<AlertDialogCancel>{cancel}</AlertDialogCancel>
					<AlertDialogAction
						className={buttonVariants({ variant: "destructive" })}
						onClick={onConfirm}
					>
						{action}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
