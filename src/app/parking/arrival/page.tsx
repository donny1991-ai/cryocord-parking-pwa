import { redirect } from "next/navigation";

export default function ArrivalPage() {
  redirect("/parking/entry?mode=qr");
}
