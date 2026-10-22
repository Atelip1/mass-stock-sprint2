import { Suspense } from "react";
import { TablaStock } from "./TablaStock";

export const metadata = { title: "Stock en tiempo real · Mass Stock" };

export default function Stock() {
  return (
    <Suspense>
      <TablaStock />
    </Suspense>
  );
}
