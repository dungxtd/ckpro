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
} from "@ckdry/ui/components/alert-dialog";
import { buttonVariants } from "@ckdry/ui/components/button";
import type { ReactNode } from "react";

/**
 * An action that cannot be undone (end an exam, delete a cluster), done only
 * once confirmed: `children` is the button that asks.
 */
export function ConfirmDialog({
	title,
	description,
	action,
	cancel = "Cancel",
	onConfirm,
	children,
}: {
	title: string;
	description: string;
	/** The destructive button's label */
	action: string;
	cancel?: string;
	onConfirm: () => void;
	children: ReactNode;
}) {
	return (
		<AlertDialog>
			<AlertDialogTrigger asChild>{children}</AlertDialogTrigger>
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
