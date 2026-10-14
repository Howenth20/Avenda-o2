"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

const POLICY_VERSION = "2026-10-14";

export default function LibroReclamacionesPage() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setMessage(""); setError("");
    const form = new FormData(event.currentTarget);
    const body = {
      fullName: form.get("fullName"), documentType: form.get("documentType"), documentNumber: form.get("documentNumber"),
      email: form.get("email"), phone: form.get("phone"), address: form.get("address"), claimType: form.get("claimType"),
      detail: form.get("detail"), requestText: form.get("requestText"), policyVersion: POLICY_VERSION, accepted: form.get("accepted") === "on", _company: form.get("_company"),
    };
    try {
      const response = await fetch("/api/claims", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json().catch(() => ({})) as { claim?: { claim_code?: string }; error?: string };
      if (!response.ok) throw new Error(data.error ?? "No se pudo registrar la reclamación.");
      event.currentTarget.reset();
      setMessage(`Registro enviado. Código de seguimiento: ${data.claim?.claim_code ?? "generado"}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "No se pudo registrar la reclamación."); }
    finally { setBusy(false); }
  }
  return <main className="legal-page"><header className="legal-header"><Link href="/" className="legal-brand">AVENDAÑO <b>RINDE+</b></Link><nav><Link href="/politicas">Política de privacidad</Link><Link href="/terminos">Términos y condiciones</Link></nav></header><div className="claim-layout"><article className="legal-document claim-intro"><span className="eyebrow">FORMULARIO DE ATENCIÓN</span><h1>Libro de reclamaciones</h1><p className="legal-lead">Registra una queja o reclamo. Recibirás un código de seguimiento al completar el formulario.</p><h2>Queja y reclamo</h2><p><b>Queja:</b> disconformidad relacionada con la atención recibida.</p><p><b>Reclamo:</b> disconformidad relacionada con un servicio, producto o resultado esperado.</p><p>El registro conserva la fecha, la versión de política aceptada y el contenido enviado. Para consultar registros vinculados a una obra, ingresa a RINDE+ con una cuenta autorizada.</p></article><article className="claim-form-card"><span className="eyebrow">NUEVO REGISTRO</span><h2>Cuéntanos lo ocurrido</h2><form className="form-grid" onSubmit={(event) => void submit(event)}><label className="span-two">Nombre completo<input name="fullName" required minLength={2} maxLength={160} /></label><label>Documento<select name="documentType" defaultValue="DNI"><option value="DNI">DNI</option><option value="CE">Carné de extranjería</option><option value="PASSPORT">Pasaporte</option><option value="RUC">RUC</option><option value="OTHER">Otro</option></select></label><label>Número de documento<input name="documentNumber" required minLength={4} maxLength={32} /></label><label>Correo electrónico<input name="email" type="email" required /></label><label>Teléfono<input name="phone" required /></label><label className="span-two">Dirección<input name="address" required minLength={4} maxLength={240} /></label><label>Tipo<select name="claimType" defaultValue="CLAIM"><option value="CLAIM">Reclamo</option><option value="COMPLAINT">Queja</option></select></label><label className="span-two">Detalle<textarea name="detail" required minLength={10} maxLength={4000} rows={5} /></label><label className="span-two">Pedido concreto<textarea name="requestText" required minLength={4} maxLength={2000} rows={3} /></label><label className="claim-consent span-two"><input name="accepted" type="checkbox" required /> Acepto la <Link href="/politicas">Política de privacidad</Link> y los <Link href="/terminos">Términos y condiciones</Link> versión {POLICY_VERSION}.</label><label className="honeypot" aria-hidden="true">Empresa<input name="_company" tabIndex={-1} autoComplete="off" /></label><button className="button button-primary form-submit" disabled={busy}>{busy ? "Enviando…" : "Registrar reclamación"}</button></form>{message && <p className="claim-success">{message}</p>}{error && <p className="claim-error">{error}</p>}</article></div></main>;
}
