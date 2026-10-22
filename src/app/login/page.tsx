import { Suspense } from "react";
import { PantallaAcceso } from "@/components/PantallaAcceso";
import { FormularioLogin } from "./FormularioLogin";

export const metadata = { title: "Inicia sesión · Mass Stock" };

export default function Login() {
  return (
    <PantallaAcceso>
      <Suspense>
        <FormularioLogin />
      </Suspense>
    </PantallaAcceso>
  );
}
