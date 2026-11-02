import { Suspense } from "react";
import { RegistrarReposicion } from "./RegistrarReposicion";

export const metadata = { title: "Registrar reposición · Mass Stock" };

export default function Pagina() {
  return (
    <Suspense>
      <RegistrarReposicion />
    </Suspense>
  );
}
