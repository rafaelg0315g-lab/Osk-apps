import { redirect } from "next/navigation";

/**
 * Workspace de un proyecto PRO (editor completo).
 * La suite PROFESIONAL está EN DESARROLLO: mientras no se publique,
 * cualquier ruta de proyecto redirige a la landing /pro.
 * El código de los editores se conserva para el lanzamiento futuro.
 */
export default function ProProjectPage() {
  redirect("/pro");
}
