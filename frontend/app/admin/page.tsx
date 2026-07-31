import { redirect } from "next/navigation";

/**
 * /admin is a namespace, not a destination — every feature lives one level deeper.
 * Without this, typing or bookmarking the bare URL hit the 404 page from inside a
 * signed-in session, which reads as the app being broken. Send it to the dashboard.
 */
export default function AdminIndexPage() {
  redirect("/dashboard");
}
