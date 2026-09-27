import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Eliminación de datos de usuario',
  description:
    'Instrucciones para solicitar la eliminación de datos personales y empresariales tratados por FuryLeeds.',
  alternates: { canonical: 'https://furyleeds.site/data-deletion' },
  robots: { index: true, follow: true },
};

export default function DataDeletionPage() {
  return (
    <LegalShell
      eyebrow="Documento legal · 03"
      title="Eliminación de datos de usuario"
      summary="Instrucciones explícitas para solicitar la eliminación de información tratada por FuryLeeds, incluyendo datos asociados a Meta y WhatsApp."
    >
      <div className="legal-note" role="note">
        <p>
          <strong>No publiques información sensible.</strong> Nunca envíes
          contraseñas, códigos de acceso, tokens de Meta, claves API ni la clave
          de cifrado de tu organización para acreditar una solicitud.
        </p>
      </div>

      <section id="tipo-solicitante">
        <h2>1. Identifica qué tipo de solicitud necesitas</h2>
        <h3>Usuario de una cuenta FuryLeeds</h3>
        <p>
          Si inicias sesión en FuryLeeds, solicita la eliminación al propietario
          o a un administrador de tu espacio de trabajo. Ellos pueden verificar
          tu identidad y definir si debe eliminarse solo tu acceso, tu perfil o
          toda la cuenta empresarial.
        </p>
        <h3>Contacto que recibió mensajes por WhatsApp</h3>
        <p>
          Contacta primero a la empresa que te escribió. Esa empresa controla
          sus contactos y conversaciones y puede localizar tus datos con
          precisión. Indica el número de WhatsApp utilizado y pide expresamente
          acceso, corrección o eliminación.
        </p>
        <h3>Solicitud directa a CEDRUS</h3>
        <p>
          Si no puedes contactar al responsable anterior, utiliza el canal
          corporativo oficialmente designado por CEDRUS TECHNOLOGY GROUP S.A.C.
          en el contrato, propuesta o comunicación de alta de FuryLeeds.
        </p>
      </section>

      <section id="pasos">
        <h2>2. Pasos para solicitar la eliminación</h2>
        <ol>
          <li>
            Escribe el asunto{' '}
            <strong>“Solicitud de eliminación de datos — FuryLeeds”</strong>.
          </li>
          <li>
            Indica tu nombre, correo de acceso o número de WhatsApp, según
            corresponda, y el nombre de la empresa o espacio de trabajo
            asociado.
          </li>
          <li>
            Describe el alcance: perfil de usuario, contacto/conversaciones,
            archivos, credenciales de integración o cierre completo de cuenta.
          </li>
          <li>
            Envía la solicitud al propietario/administrador del espacio o al
            canal corporativo oficialmente designado por CEDRUS.
          </li>
          <li>
            Atiende la verificación de identidad y autoridad. Podemos pedir
            información adicional limitada para evitar eliminar datos de otra
            persona o empresa.
          </li>
          <li>
            Una vez validada, recibirás confirmación de recepción y, cuando el
            proceso termine, confirmación de ejecución o explicación de
            cualquier dato que deba conservarse legalmente.
          </li>
        </ol>
      </section>

      <section id="meta">
        <h2>3. Revocar Meta o Google no equivale a eliminar datos</h2>
        <p>
          Puedes revocar permisos desde la configuración de tu cuenta de Google
          o desde Meta Business/Facebook. Esto impide acceso futuro mediante esa
          integración, pero no elimina automáticamente información que ya se
          haya almacenado legítimamente en FuryLeeds. Para eliminarla debes
          completar los pasos anteriores.
        </p>
        <p>
          Si llegaste a esta página desde la opción de eliminación de datos de
          una aplicación de Meta, menciona en tu solicitud que está relacionada
          con
          <strong> Meta/WhatsApp</strong> e identifica la empresa y el número
          comercial con los que interactuaste.
        </p>
      </section>

      <section id="alcance">
        <h2>4. Datos incluidos</h2>
        <p>Según el alcance validado, la eliminación puede incluir:</p>
        <ul>
          <li>perfil, sesiones y asociaciones de acceso;</li>
          <li>contactos, notas, etiquetas y campos personalizados;</li>
          <li>conversaciones, mensajes, reacciones y estados de entrega;</li>
          <li>archivos almacenados mediante Imgora y referencias asociadas;</li>
          <li>campañas, oportunidades, automatizaciones y flujos;</li>
          <li>configuraciones de Meta, IA, API y webhooks de la cuenta;</li>
          <li>documentos de conocimiento y registros de uso vinculados.</li>
        </ul>
      </section>

      <section id="excepciones">
        <h2>5. Límites y conservación necesaria</h2>
        <p>
          Podemos conservar información mínima cuando sea necesaria para cumplir
          una obligación legal, prevenir fraude o abuso, resolver disputas,
          acreditar una operación o proteger derechos. Los datos eliminados del
          sistema activo pueden permanecer temporalmente en copias de seguridad
          hasta que estas sean rotadas conforme al ciclo operativo, sin volver a
          utilizarse para fines ordinarios.
        </p>
      </section>

      <section id="propietarios">
        <h2>6. Cierre de una cuenta empresarial</h2>
        <p>
          Solo el propietario de la cuenta o una persona con autoridad
          acreditada puede solicitar el cierre completo del espacio de trabajo.
          FuryLeeds no ofrece actualmente un botón de eliminación total
          autoservicio; el cierre se coordina mediante el canal corporativo para
          evitar pérdidas accidentales y verificar obligaciones pendientes.
        </p>
      </section>

      <section id="referencias">
        <h2>7. Más información</h2>
        <p>
          Consulta la <Link href="/privacy">Política de privacidad</Link> para
          conocer las categorías de información, proveedores, finalidades y
          derechos. El uso del servicio también está sujeto a las{' '}
          <Link href="/terms">Condiciones del servicio</Link>.
        </p>
      </section>
    </LegalShell>
  );
}
