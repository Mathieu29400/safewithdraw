import type { Metadata } from "next";
import { LegalSection, LegalShell } from "../(legal)/legal-shell";

export const metadata: Metadata = {
  title: "Conditions d'utilisation — SafeWithdraw",
  description:
    "Conditions générales d'utilisation du service SafeWithdraw, plateforme SaaS pour freelances.",
};

export default function TermsPage() {
  return (
    <LegalShell title="Conditions d'utilisation" updatedAt="3 mai 2026">
      <LegalSection title="1. Service">
        <p>
          SafeWithdraw est un service en ligne (SaaS) destiné aux freelances et
          travailleurs indépendants. Il leur permet de calculer en temps réel
          le montant qu&apos;ils peuvent retirer de leur activité en toute
          sécurité, en tenant compte de leurs cotisations URSSAF et d&apos;une
          réserve recommandée.
        </p>
        <p>
          L&apos;éditeur du service est SafeWithdraw, joignable à l&apos;adresse{" "}
          <a
            href="mailto:hello@safewithdraw.app"
            className="text-emerald-400 hover:underline"
          >
            hello@safewithdraw.app
          </a>
          .
        </p>
      </LegalSection>

      <LegalSection title="2. Accès au service">
        <p>
          L&apos;accès au service nécessite la création d&apos;un compte et la
          souscription à un abonnement. SafeWithdraw est accessible via un
          navigateur internet, 24 heures sur 24, sous réserve des opérations de
          maintenance et d&apos;éventuelles défaillances techniques.
        </p>
      </LegalSection>

      <LegalSection title="3. Essai gratuit de 30 jours">
        <p>
          Tout nouvel utilisateur bénéficie d&apos;une période d&apos;essai
          gratuite de 30 jours. Aucun paiement n&apos;est exigé pendant cette
          période. L&apos;utilisateur peut annuler à tout moment avant la fin
          de l&apos;essai sans être facturé.
        </p>
      </LegalSection>

      <LegalSection title="4. Abonnement et renouvellement automatique">
        <p>
          À l&apos;issue de la période d&apos;essai gratuite, l&apos;abonnement
          est facturé selon le tarif en vigueur. L&apos;abonnement se
          renouvelle automatiquement à chaque échéance jusqu&apos;à
          l&apos;annulation par l&apos;utilisateur.
        </p>
        <p>
          L&apos;utilisateur peut annuler son abonnement à tout moment depuis
          son tableau de bord. L&apos;accès au service reste actif
          jusqu&apos;à la fin de la période de facturation en cours.
        </p>
      </LegalSection>

      <LegalSection title="5. Responsabilité de l'utilisateur">
        <p>
          SafeWithdraw fournit un outil d&apos;aide à la décision financière.
          Les calculs sont effectués à partir des informations saisies par
          l&apos;utilisateur (chiffre d&apos;affaires, taux URSSAF,
          dépenses…). L&apos;utilisateur reste seul responsable des décisions
          financières qu&apos;il prend, y compris du montant qu&apos;il choisit
          effectivement de se verser.
        </p>
      </LegalSection>

      <LegalSection title="6. Absence de conseil financier ou comptable">
        <p>
          SafeWithdraw n&apos;est ni un conseiller financier, ni un expert
          comptable, ni un avocat fiscaliste. Le service ne constitue pas un
          conseil financier, fiscal ou juridique. Pour toute situation
          spécifique, l&apos;utilisateur est invité à consulter un
          professionnel qualifié.
        </p>
      </LegalSection>

      <LegalSection title="7. Suspension du compte">
        <p>
          SafeWithdraw se réserve le droit de suspendre ou de résilier
          l&apos;accès d&apos;un compte en cas d&apos;abus, d&apos;utilisation
          frauduleuse, de non-respect des présentes conditions, ou de toute
          activité susceptible de nuire au service ou à ses utilisateurs.
        </p>
      </LegalSection>

      <LegalSection title="8. Modification des conditions">
        <p>
          SafeWithdraw peut modifier les présentes conditions à tout moment.
          Les utilisateurs seront informés des modifications substantielles
          par email ou via le tableau de bord.
        </p>
      </LegalSection>

      <LegalSection title="9. Contact">
        <p>
          Pour toute question relative aux présentes conditions, vous pouvez
          nous contacter à{" "}
          <a
            href="mailto:hello@safewithdraw.app"
            className="text-emerald-400 hover:underline"
          >
            hello@safewithdraw.app
          </a>
          .
        </p>
      </LegalSection>
    </LegalShell>
  );
}
