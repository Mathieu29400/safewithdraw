import type { Metadata } from "next";
import { LegalSection, LegalShell } from "../(legal)/legal-shell";

export const metadata: Metadata = {
  title: "Politique de confidentialité — SafeWithdraw",
  description:
    "Comment SafeWithdraw collecte, utilise et protège les données personnelles de ses utilisateurs.",
};

export default function PrivacyPage() {
  return (
    <LegalShell title="Politique de confidentialité" updatedAt="3 mai 2026">
      <LegalSection title="1. Données collectées">
        <p>
          Pour fournir le service, SafeWithdraw collecte les données suivantes :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-slate-200">Données de compte</strong> :
            adresse email et mot de passe (chiffré).
          </li>
          <li>
            <strong className="text-slate-200">Données financières saisies</strong>{" "}
            : chiffres d&apos;affaires, retraits, dépenses professionnelles,
            taux URSSAF et profil de déclaration.
          </li>
          <li>
            <strong className="text-slate-200">Données d&apos;usage</strong> :
            logs techniques (date de connexion, navigateur, erreurs) utilisés
            uniquement pour assurer le bon fonctionnement du service.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="2. Utilisation des données">
        <p>
          Les données sont utilisées exclusivement pour :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>fournir et maintenir le service SafeWithdraw,</li>
          <li>calculer en temps réel votre montant retirable,</li>
          <li>vous envoyer des emails transactionnels (bienvenue,
            réinitialisation de mot de passe, notifications de facturation),</li>
          <li>améliorer la qualité du service.</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Aucune revente de données">
        <p>
          SafeWithdraw ne vend, ne loue, ni n&apos;échange aucune donnée
          personnelle de ses utilisateurs avec des tiers à des fins
          commerciales ou publicitaires.
        </p>
      </LegalSection>

      <LegalSection title="4. Stockage et sécurité">
        <p>
          Les données sont stockées de manière sécurisée chez{" "}
          <strong className="text-slate-200">Supabase</strong>, hébergeur
          conforme au RGPD. Les communications sont chiffrées via TLS, les
          mots de passe sont hachés, et l&apos;accès aux données est restreint
          par des règles d&apos;autorisation au niveau de la base de données
          (Row Level Security).
        </p>
      </LegalSection>

      <LegalSection title="5. Sous-traitants">
        <p>
          SafeWithdraw fait appel aux sous-traitants suivants pour fournir le
          service :
        </p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>
            <strong className="text-slate-200">Supabase</strong> — hébergement
            et base de données.
          </li>
          <li>
            <strong className="text-slate-200">Vercel</strong> — hébergement de
            l&apos;application.
          </li>
          <li>
            <strong className="text-slate-200">Resend</strong> — envoi des
            emails transactionnels.
          </li>
          <li>
            <strong className="text-slate-200">Paddle</strong> — gestion des
            paiements et de la facturation.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="6. Vos droits">
        <p>
          Conformément au RGPD, vous disposez d&apos;un droit d&apos;accès,
          de rectification, de portabilité et de suppression de vos données.
          Vous pouvez à tout moment demander la suppression complète de votre
          compte et de toutes les données associées en nous contactant à{" "}
          <a
            href="mailto:safewithdraw.contact@gmail.com"
            className="text-emerald-400 hover:underline"
          >
            safewithdraw.contact@gmail.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="7. Conservation des données">
        <p>
          Les données du compte sont conservées tant que le compte est actif.
          En cas de suppression du compte, l&apos;ensemble des données
          personnelles est effacé sous 30 jours, sauf obligation légale de
          conservation (facturation, comptabilité).
        </p>
      </LegalSection>

      <LegalSection title="8. Contact">
        <p>
          Pour toute question relative à la confidentialité ou pour exercer
          vos droits, vous pouvez nous contacter à{" "}
          <a
            href="mailto:safewithdraw.contact@gmail.com"
            className="text-emerald-400 hover:underline"
          >
            safewithdraw.contact@gmail.com
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
