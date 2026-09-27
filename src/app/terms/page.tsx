import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Condiciones del servicio',
  description:
    'Condiciones aplicables al acceso y uso de FuryLeeds, operado por CEDURS TECHNOLOGY GROUP S.A.C.',
  alternates: { canonical: 'https://furyleeds.site/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <LegalShell
      eyebrow="Documento legal · 02"
      title="Condiciones del servicio"
      summary="Estas condiciones regulan el acceso a FuryLeeds y complementan el acuerdo comercial celebrado con CEDURS TECHNOLOGY GROUP S.A.C."
    >
      <section id="aceptacion">
        <h2>1. Aceptación</h2>
        <p>
          Al crear una cuenta, aceptar una invitación o utilizar FuryLeeds,
          aceptas estas condiciones y la{' '}
          <Link href="/privacy">Política de privacidad</Link>. Si actúas en
          representación de una empresa, declaras tener autoridad para
          obligarla. Si existe un contrato escrito con CEDURS, dicho contrato
          prevalece ante cualquier contradicción específica.
        </p>
      </section>

      <section id="servicio">
        <h2>2. Servicio</h2>
        <p>
          FuryLeeds es una plataforma empresarial multiusuario para gestionar
          contactos, conversaciones de WhatsApp, campañas, plantillas, ventas,
          automatizaciones, archivos, integraciones y funciones opcionales de
          inteligencia artificial. Algunas capacidades dependen de proveedores
          externos y de configuraciones realizadas por el cliente.
        </p>
      </section>

      <section id="cuentas">
        <h2>3. Cuentas y acceso</h2>
        <ul>
          <li>
            Debes proporcionar información exacta y mantenerla actualizada.
          </li>
          <li>Eres responsable de proteger tus credenciales y sesiones.</li>
          <li>
            El propietario y los administradores del espacio controlan miembros,
            roles, integraciones y acceso a los datos de su organización.
          </li>
          <li>
            Debes notificarnos por el canal corporativo designado si detectas
            uso no autorizado o una vulneración de seguridad.
          </li>
        </ul>
      </section>

      <section id="uso-aceptable">
        <h2>4. Uso aceptable</h2>
        <p>No puedes utilizar FuryLeeds para:</p>
        <ul>
          <li>infringir leyes, derechos de terceros o políticas de Meta;</li>
          <li>enviar spam, fraude, amenazas o contenido ilícito;</li>
          <li>
            contactar personas sin la autorización o base legal requerida;
          </li>
          <li>eludir límites, controles de acceso o medidas de seguridad;</li>
          <li>
            introducir malware o interferir con la disponibilidad del servicio;
          </li>
          <li>
            revender, copiar o explotar el software sin autorización escrita.
          </li>
        </ul>
      </section>

      <section id="responsabilidad-cliente">
        <h2>5. Responsabilidades del cliente</h2>
        <p>
          El cliente determina qué datos incorpora, a quién contacta y qué
          automatizaciones activa. Debe informar a sus contactos, obtener los
          consentimientos necesarios, atender sus derechos, conservar pruebas de
          autorización y configurar correctamente usuarios, permisos, números,
          plantillas, webhooks y proveedores. Las acciones realizadas con una
          cuenta autorizada se consideran efectuadas por el cliente.
        </p>
      </section>

      <section id="terceros">
        <h2>6. Servicios de terceros</h2>
        <p>
          WhatsApp Cloud API, Meta, Google, ChatSend, Imgora, Cloudflare y los
          proveedores de IA son servicios independientes sujetos a sus propias
          condiciones. FuryLeeds no controla sus aprobaciones, disponibilidad,
          límites, políticas, suspensiones ni cambios. El cliente es responsable
          de las cuentas y credenciales que conecta.
        </p>
      </section>

      <section id="datos">
        <h2>7. Datos y propiedad</h2>
        <p>
          El cliente conserva los derechos que tenga sobre sus datos. Autoriza a
          CEDURS y a sus proveedores a tratarlos en la medida necesaria para
          prestar, proteger y mantener FuryLeeds. CEDURS conserva todos los
          derechos sobre el software, diseño, documentación, marcas y mejoras
          del servicio. Ninguna disposición transfiere propiedad intelectual.
        </p>
      </section>

      <section id="planes">
        <h2>8. Planes, pagos y cambios</h2>
        <p>
          Precios, límites, impuestos, facturación y vigencia se establecen en
          la propuesta, orden o contrato aplicable. Podemos modificar o retirar
          funciones para mantener seguridad, cumplimiento o viabilidad técnica,
          procurando comunicar cambios materiales cuando corresponda.
        </p>
      </section>

      <section id="disponibilidad">
        <h2>9. Disponibilidad y soporte</h2>
        <p>
          Trabajamos para mantener el servicio disponible, pero pueden existir
          mantenimientos, fallos de red, incidentes de proveedores y eventos
          fuera de nuestro control. Los compromisos específicos de soporte,
          continuidad o nivel de servicio solo aplican cuando constan en un
          acuerdo escrito.
        </p>
      </section>

      <section id="suspension">
        <h2>10. Suspensión y terminación</h2>
        <p>
          Podemos limitar o suspender acceso para proteger el servicio,
          responder a una obligación legal, evitar abuso, atender falta de pago
          o corregir una infracción grave. El cliente puede solicitar la
          terminación mediante su canal corporativo. La terminación no elimina
          obligaciones ya devengadas ni datos que deban conservarse legalmente.
        </p>
        <p>
          Las solicitudes de información y eliminación siguen el procedimiento
          publicado en <Link href="/data-deletion">Eliminación de datos</Link>.
        </p>
      </section>

      <section id="garantias">
        <h2>11. Garantías y responsabilidad</h2>
        <p>
          FuryLeeds se proporciona conforme al acuerdo aplicable y, en la máxima
          medida permitida por ley, sin garantías implícitas adicionales. CEDURS
          no responde por decisiones comerciales del cliente, contenido enviado,
          uso ilícito, pérdida causada por credenciales comprometidas ni fallos
          de proveedores externos. Cualquier límite de responsabilidad se regirá
          por el contrato escrito y la legislación aplicable.
        </p>
      </section>

      <section id="ley-cambios">
        <h2>12. Legislación, cambios y contacto</h2>
        <p>
          Estas condiciones se interpretan junto con la legislación y
          jurisdicción establecidas en el acuerdo entre CEDURS y el cliente.
          Podemos actualizarlas publicando una nueva versión en esta URL. Para
          consultas, utiliza el canal corporativo oficialmente designado en tu
          contrato o comunícate con el propietario o administrador de tu espacio
          FuryLeeds.
        </p>
      </section>
    </LegalShell>
  );
}
