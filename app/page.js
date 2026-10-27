import { redirect } from "next/navigation";

// The desk's home is the request list.
export default function Home() {
  redirect("/requests");
}
