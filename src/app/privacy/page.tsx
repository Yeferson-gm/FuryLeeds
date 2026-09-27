import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalShell } from '@/components/legal/legal-shell';

export const metadata: Metadata = {
  title: 'Política de privacidad',
  description:
    'Política de privacidad de FuryLeeds y CEDRUS TECHNOLOGY GROUP S.A.C.',
  alternates: { canonical: 'https://furyleeds.site/privacy' },
  robots: { index: true, follow: true },
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Documento legal · 01"
      title="Política de privacidad"
      summary="Explica qué información trata FuryLeeds, para qué se utiliza, con quién puede compartirse y cómo ejercer derechos o solicitar su eliminación."
    >
      <section id="responsable">
        <h2>1. Responsable y alcance</h2>
        <p>
          FuryLeeds es un servicio de gestión de relaciones con clientes y
          mensajería empresarial operado por{' '}
          <strong>CEDRUS TECHNOLOGY GROUP S.A.C.</strong> (en adelante,
          “CEDRUS”, “FuryLeeds” o “nosotros”). Esta política se aplica a las
          personas que crean o utilizan una cuenta FuryLeeds y a la información
          procesada mediante el servicio.
        </p>
        <p>
          Cuando una empresa cliente incorpora contactos, conversaciones u otra
          información de sus propios clientes, esa empresa determina los fines
          de dicho tratamiento y CEDRUS procesa la información para prestarle el
          servicio. Las consultas de esos contactos deben dirigirse primero a la
          empresa con la que mantienen la relación comercial.
        </p>
      </section>

      <section id="informacion">
        <h2>2. Información que tratamos</h2>
        <ul>
          <li>
            <strong>Cuenta e identidad:</strong> nombre, correo electrónico,
            imagen de perfil, pertenencia a un espacio de trabajo, rol,
            sesiones, dirección IP y agente de usuario.
          </li>
          <li>
            <strong>Datos CRM:</strong> contactos, números telefónicos, nombres,
            empresas, etiquetas, notas, campos personalizados, oportunidades y
            actividad de gestión.
          </li>
          <li>
            <strong>Mensajería:</strong> conversaciones, mensajes, reacciones,
            archivos, estados de entrega, plantillas, campañas, automatizaciones
            y flujos procesados mediante WhatsApp Cloud API.
          </li>
          <li>
            <strong>Integraciones:</strong> identificadores de Meta,
            configuración de WhatsApp, credenciales cifradas, claves API con
            hash, endpoints de webhook y metadatos técnicos necesarios para
            operar el servicio.
          </li>
          <li>
            <strong>Funciones de IA opcionales:</strong> proveedor y modelo
            elegidos por la cuenta, instrucciones, documentos de conocimiento,
            fragmentos de conversación enviados al proveedor y métricas de uso.
          </li>
          <li>
            <strong>Información técnica:</strong> registros de seguridad y
            operación, errores, rendimiento, eventos de autenticación y métricas
            de navegación obtenidas mediante Cloudflare Web Analytics.
          </li>
        </ul>
      </section>

      <section id="origen">
        <h2>3. Origen de la información</h2>
        <p>
          Recibimos información directamente de usuarios y administradores de
          cuentas, de sus contactos durante conversaciones empresariales, de
          Meta WhatsApp Cloud API, de Google cuando se utiliza inicio de sesión
          con Google y de los dispositivos o navegadores que acceden al
          servicio. También procesamos información generada por el uso normal de
          FuryLeeds.
        </p>
      </section>

      <section id="finalidades">
        <h2>4. Finalidades del tratamiento</h2>
        <ul>
          <li>crear cuentas, autenticar usuarios y proteger sesiones;</li>
          <li>
            prestar el inbox compartido, CRM, campañas y automatizaciones;
          </li>
          <li>enviar, recibir y sincronizar comunicaciones solicitadas;</li>
          <li>almacenar archivos y facilitar su entrega autorizada;</li>
          <li>operar integraciones, API pública y webhooks configurados;</li>
          <li>prevenir abuso, investigar errores y mantener la seguridad;</li>
          <li>
            generar respuestas asistidas por IA cuando la cuenta lo habilita;
          </li>
          <li>cumplir obligaciones legales y acuerdos aplicables.</li>
        </ul>
        <p>
          Según la relación y normativa aplicable, el tratamiento se sustenta en
          la ejecución del servicio contratado, el consentimiento, instrucciones
          del cliente, intereses legítimos de seguridad y operación, o una
          obligación legal.
        </p>
      </section>

      <section id="proveedores">
        <h2>5. Proveedores y transferencias</h2>
        <p>
          FuryLeeds utiliza proveedores únicamente para funciones concretas. La
          información puede ser procesada por PostgreSQL en infraestructura
          administrada por el operador, Meta para WhatsApp Cloud API, Google
          para OAuth, ChatSend para correo transaccional, Imgora para archivos,
          Cloudflare para entrega y analítica web, y el proveedor de IA elegido
          por la cuenta. También se envían eventos a webhooks que el propio
          cliente configura.
        </p>
        <p>
          Estos proveedores pueden operar en otras jurisdicciones. Cada cliente
          debe evaluar las condiciones, región y retención de los proveedores
          opcionales que habilita. No vendemos información personal.
        </p>
      </section>

      <section id="retencion">
        <h2>6. Conservación</h2>
        <p>
          Conservamos la información mientras la cuenta esté activa y durante el
          tiempo razonablemente necesario para prestar el servicio, resolver
          incidencias, proteger derechos y cumplir obligaciones. Una solicitud
          de eliminación puede requerir conservar datos mínimos cuando exista
          una obligación legal, una controversia, prevención de fraude o copias
          de seguridad sujetas a su ciclo operativo.
        </p>
        <p>
          La revocación de una integración detiene el acceso futuro, pero no
          elimina automáticamente datos que ya fueron almacenados. Consulta las{' '}
          <Link href="/data-deletion">instrucciones de eliminación</Link>.
        </p>
      </section>

      <section id="seguridad">
        <h2>7. Seguridad</h2>
        <p>
          Aplicamos controles técnicos y organizativos proporcionales,
          incluyendo aislamiento lógico por cuenta, autorización por roles,
          cifrado de credenciales sensibles, hash de claves de acceso,
          validación de firmas de Meta, conexiones HTTPS, controles contra
          solicitudes a redes privadas y registro operativo limitado. Ningún
          sistema puede garantizar seguridad absoluta.
        </p>
      </section>

      <section id="derechos">
        <h2>8. Derechos y opciones</h2>
        <p>
          De acuerdo con la normativa aplicable, puedes solicitar acceso,
          corrección, actualización, oposición, portabilidad o eliminación de tu
          información. Los usuarios de un espacio deben contactar primero a su
          propietario o administrador. Los contactos de una empresa usuaria
          deben dirigirse a esa empresa, que controla la relación y puede
          identificar correctamente sus registros.
        </p>
        <p>
          Para una solicitud relacionada directamente con CEDRUS, utiliza el
          canal corporativo oficialmente designado en tu contrato o comunicación
          de alta. No envíes contraseñas, tokens ni claves API. Podemos
          solicitar información razonable para verificar identidad y autoridad
          antes de actuar.
        </p>
      </section>

      <section id="menores">
        <h2>9. Menores de edad</h2>
        <p>
          FuryLeeds es una herramienta empresarial y no está dirigida a menores
          de edad. Los clientes no deben utilizar el servicio para recopilar
          conscientemente información de menores sin una base legal y las
          autorizaciones exigibles.
        </p>
      </section>

      <section id="cambios">
        <h2>10. Cambios y contacto</h2>
        <p>
          Podemos actualizar esta política para reflejar cambios legales,
          operativos o del producto. Publicaremos la versión vigente en esta URL
          e indicaremos su fecha de entrada en vigor. Las consultas se atienden
          a través del propietario o administrador de la cuenta y del canal
          corporativo oficialmente designado por CEDRUS TECHNOLOGY GROUP S.A.C.
        </p>
      </section>
    </LegalShell>
  );
}
