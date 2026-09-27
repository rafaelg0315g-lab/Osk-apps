"use client";

import { useState } from "react";
import { PDFDocument } from "pdf-lib-plus-encrypt";
import { Eye, EyeOff, Loader2, LockKeyhole } from "lucide-react";
import { toast } from "sonner";

import { DownloadButton } from "@/components/shared/download-button";
import { FileDropzone } from "@/components/shared/file-dropzone";
import { ToolShell } from "@/components/shared/tool-shell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_FILE_MB = 20;
const MIN_PASSWORD_LENGTH = 4;

function baseName(name: string): string {
  return name.replace(/\.pdf$/i, "");
}

interface PermissionToggle {
  key: "printing" | "copying" | "modifying";
  label: string;
  description: string;
}

const PERMISSIONS: PermissionToggle[] = [
  {
    key: "printing",
    label: "Permitir imprimir",
    description: "El lector podrá imprimir el documento.",
  },
  {
    key: "copying",
    label: "Permitir copiar texto",
    description: "El lector podrá copiar y extraer texto e imágenes.",
  },
  {
    key: "modifying",
    label: "Permitir modificar",
    description: "El lector podrá editar el contenido del documento.",
  },
];

export default function ProtectPdf() {
  const [files, setFiles] = useState<File[]>([]);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [allowPrinting, setAllowPrinting] = useState(true);
  const [allowCopying, setAllowCopying] = useState(true);
  const [allowModifying, setAllowModifying] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<Blob | null>(null);
  const [resultName, setResultName] = useState("");

  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    files.length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    passwordsMatch &&
    !processing;

  const handleFilesChange = (next: File[]) => {
    const valid = next.filter((file) => {
      if (file.name.toLowerCase().endsWith(".pdf")) return true;
      toast.error(`"${file.name}" no es un archivo PDF`);
      return false;
    });
    setFiles(valid);
    setResult(null);
  };

  const handleProtect = async () => {
    const file = files[0];
    if (!file || processing) return;

    setProcessing(true);
    setResult(null);

    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const doc = await PDFDocument.load(bytes);

      await doc.encrypt({
        userPassword: password,
        ownerPassword: password,
        permissions: {
          printing: allowPrinting ? "highResolution" : false,
          copying: allowCopying,
          modifying: allowModifying,
        },
      });

      const output = await doc.save();
      setResult(
        new Blob([output.slice().buffer as ArrayBuffer], {
          type: "application/pdf",
        }),
      );
      setResultName(`${baseName(file.name)}-protegido.pdf`);
      toast.success("PDF protegido correctamente");
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const isEncrypted = /encrypted/i.test(message);
      toast.error(
        isEncrypted
          ? "El PDF ya está protegido con contraseña"
          : "No se pudo proteger el PDF",
        {
          description: isEncrypted
            ? "Desbloquéalo primero con la herramienta Desbloquear PDF si quieres cambiar su contraseña."
            : "El archivo podría estar dañado. Prueba con otro PDF.",
        },
      );
    } finally {
      setProcessing(false);
    }
  };

  const reset = () => {
    setFiles([]);
    setPassword("");
    setConfirm("");
    setResult(null);
  };

  const renderPasswordInput = (
    id: string,
    value: string,
    onChange: (value: string) => void,
    visible: boolean,
    onToggle: () => void,
    label: string,
    error?: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          autoComplete="new-password"
          className="pr-10"
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onToggle}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute right-1 top-1 size-8 text-muted-foreground hover:text-foreground"
        >
          {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </div>
      {error && (
        <p id={`${id}-error`} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );

  return (
    <ToolShell>
      <Card>
        <CardHeader>
          <CardTitle>Proteger PDF con contraseña</CardTitle>
          <CardDescription>
            Cifra tu PDF para que solo se pueda abrir con la contraseña. Máx.{" "}
            {MAX_FILE_MB} MB.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <FileDropzone
            files={files}
            onFilesChange={handleFilesChange}
            accept=".pdf,application/pdf"
            multiple={false}
            maxFiles={1}
            maxSizeMB={MAX_FILE_MB}
            disabled={processing}
            hint="El PDF no debe tener ya una contraseña"
          />

          <div className="grid gap-4 sm:grid-cols-2">
            {renderPasswordInput(
              "protect-password",
              password,
              setPassword,
              showPassword,
              () => setShowPassword((value) => !value),
              `Contraseña (mínimo ${MIN_PASSWORD_LENGTH} caracteres)`,
            )}
            {renderPasswordInput(
              "protect-confirm",
              confirm,
              setConfirm,
              showConfirm,
              () => setShowConfirm((value) => !value),
              "Confirmar contraseña",
              passwordsMismatch ? "Las contraseñas no coinciden" : undefined,
            )}
          </div>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Permisos al abrir el PDF</legend>
            {PERMISSIONS.map((permission) => (
              <div
                key={permission.key}
                className="flex items-start gap-3 rounded-lg border bg-muted/30 p-3"
              >
                <Checkbox
                  id={`perm-${permission.key}`}
                  checked={
                    permission.key === "printing"
                      ? allowPrinting
                      : permission.key === "copying"
                        ? allowCopying
                        : allowModifying
                  }
                  onCheckedChange={(checked) => {
                    const value = checked === true;
                    if (permission.key === "printing") setAllowPrinting(value);
                    else if (permission.key === "copying") setAllowCopying(value);
                    else setAllowModifying(value);
                  }}
                  className="mt-0.5"
                  aria-describedby={`perm-${permission.key}-desc`}
                />
                <div className="space-y-0.5">
                  <Label
                    htmlFor={`perm-${permission.key}`}
                    className="cursor-pointer font-normal"
                  >
                    {permission.label}
                  </Label>
                  <p
                    id={`perm-${permission.key}-desc`}
                    className="text-xs text-muted-foreground"
                  >
                    {permission.description}
                  </p>
                </div>
              </div>
            ))}
          </fieldset>

          <Alert className="border-rose-500/40 bg-rose-500/5 text-rose-900 dark:text-rose-200">
            <LockKeyhole aria-hidden />
            <AlertDescription>
              El cifrado se aplica por completo en tu navegador: el archivo y la
              contraseña nunca se envían a ningún servidor. Guarda la contraseña
              en un lugar seguro: no hay forma de recuperarla. Los permisos son
              una indicación que los lectores respetuosos aplicarán.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={handleProtect}
              disabled={!canSubmit}
              className="gap-2 bg-rose-600 text-white hover:bg-rose-700"
            >
              {processing ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <LockKeyhole aria-hidden />
              )}
              Proteger PDF
            </Button>
            {result && (
              <Button
                type="button"
                variant="outline"
                onClick={reset}
                disabled={processing}
              >
                Proteger otro archivo
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>PDF protegido</CardTitle>
            <CardDescription>
              Se necesitará la contraseña para abrirlo. Pruébala antes de
              archivar el original.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DownloadButton
              blob={result}
              filename={resultName}
              label="Descargar PDF protegido"
              size="lg"
            />
          </CardContent>
        </Card>
      )}
    </ToolShell>
  );
}
