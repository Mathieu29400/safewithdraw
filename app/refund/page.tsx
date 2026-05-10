import type { Metadata } from "next";
import { LegalSection, LegalShell } from "../(legal)/legal-shell";

export const metadata: Metadata = {
  title: "Politique de remboursement — SafeWithdraw",
  description:
    "Conditions de remboursement, d'annulation et d'essai gratuit du service SafeWithdraw.",
};

export default function RefundPage() {
  return (
    <LegalShell title="Politique de remboursement" updatedAt="3 mai 2026">
      <LegalSection title="1. Essai gratuit de 30 jours">
        <p>
          Tout nouvel utilisateur bénéficie d&apos;une période d&apos;essai
          gratuite de 30 jours, sans carte bancaire requise. Aucun montant
          n&apos;est facturé pendant cette période. Vous pouvez annuler à
          tout moment avant la fin de l&apos;essai sans aucun frais.
        </p>
      </LegalSection>

      <LegalSection title="2. Pas de remboursement après le début de l'abonnement">
        <p>
          À l&apos;issue de l&apos;essai gratuit, l&apos;abonnement payant
          démarre automatiquement. Conformément à la nature du service
          (logiciel en ligne accessible immédiatement), aucun remboursement
          n&apos;est effectué sur les périodes d&apos;abonnement déjà
          facturées.
        </p>
        <p>
          Cette règle inclut les renouvellements mensuels ou annuels :
          l&apos;annulation d&apos;un abonnement n&apos;entraîne pas le
          remboursement de la période en cours.
        </p>
      </LegalSection>

      <LegalSection title="3. Annulation à tout moment">
        <p>
          Vous pouvez annuler votre abonnement à tout moment depuis votre
          tableau de bord, sans justification ni démarche compliquée.
          L&apos;annulation prend effet à la fin de la période de facturation
          en cours.
        </p>
      </LegalSection>

      <LegalSection title="4. Maintien de l'accès jusqu'à la fin de la période">
        <p>
          Après annulation, vous conservez l&apos;accès complet à
          SafeWithdraw jusqu&apos;à la date d&apos;échéance de votre dernière
          période payée. Aucun renouvellement n&apos;aura lieu après cette
          date.
        </p>
      </LegalSection>

      <LegalSection title="5. Cas exceptionnels">
        <p>
          En cas de problème technique majeur empêchant l&apos;utilisation du
          service de manière prolongée et imputable à SafeWithdraw, un
          remboursement au prorata pourra être étudié au cas par cas. Pour
          toute demande, contactez-nous à{" "}
          <a
            href="mailto:safewithdraw.contact@gmail.com"
            className="text-emerald-400 hover:underline"
          >
            safewithdraw.contact@gmail.com
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="6. Contact">
        <p>
          Pour toute question relative à la facturation ou à l&apos;annulation
          de votre abonnement, écrivez-nous à{" "}
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
