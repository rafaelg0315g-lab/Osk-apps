import { redirect } from "next/navigation";

/**
 * Vista "Mis proyectos" de un editor PRO.
 * La suite PROFESIONAL está EN DESARROLLO: mientras no se publique,
 * cualquier ruta de editor redirige a la landing /pro.
 */
export default function ProToolPage() {
  redirect("/pro");
}
