/** An exam's name where its certification shows already (its heading, a
 * calendar day): without the certification and "Practice Lab" */
export const shortTitle = (title: string) =>
	title.replace(/^CK(A|AD|S)\s+/i, "").replace(/^Practice Lab\s*-\s*/i, "");
