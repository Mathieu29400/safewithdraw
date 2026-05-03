import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Tailwind,
  Text,
  pixelBasedPreset,
} from "react-email";

interface WelcomeEmailProps {
  dashboardUrl?: string;
}

export default function WelcomeEmail({
  dashboardUrl = "https://safewithdraw.app/dashboard",
}: WelcomeEmailProps) {
  return (
    <Html lang="fr">
      <Tailwind
        config={{
          presets: [pixelBasedPreset],
          theme: {
            extend: {
              colors: {
                emerald: {
                  300: "#6ee7b7",
                  400: "#34d399",
                  500: "#10b981",
                  600: "#059669",
                },
              },
            },
          },
        }}
      >
        <Head />
        <Preview>
          Bienvenue sur SafeWithdraw — ton compte est prêt 🎉
        </Preview>
        <Body className="bg-slate-50 font-sans">
          <Container className="mx-auto max-w-600 py-40">
            {/* Header */}
            <Section className="rounded-t-16 bg-slate-900 px-32 py-28 text-center">
              <Text className="m-0 text-20 font-semibold tracking-tight text-white">
                SafeWithdraw
              </Text>
              <Text className="m-0 mt-4 text-12 uppercase tracking-widest text-emerald-400">
                Freelance · Finance
              </Text>
            </Section>

            {/* Green accent bar */}
            <Section className="bg-emerald-500 px-0 py-4" />

            {/* Body */}
            <Section className="bg-white px-32 py-32">
              <Heading className="m-0 text-28 font-semibold text-slate-900">
                Ton compte est prêt 🎉
              </Heading>
              <Text className="mt-16 text-16 leading-24 text-slate-600">
                Bienvenue sur SafeWithdraw ! Tu peux maintenant savoir
                exactement combien tu peux te verser sans risque — calcul
                URSSAF inclus, mis à jour en temps réel.
              </Text>

              <Section className="mt-24 rounded-12 bg-slate-50 px-24 py-20">
                <Text className="m-0 text-11 font-semibold uppercase tracking-widest text-slate-400">
                  Ce que SafeWithdraw calcule pour toi
                </Text>
                <Text className="m-0 mt-12 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Montant retirable en temps réel
                </Text>
                <Text className="m-0 mt-8 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Déduction URSSAF automatique (selon ton activité)
                </Text>
                <Text className="m-0 mt-8 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Réserve de sécurité recommandée (10 %)
                </Text>
                <Text className="m-0 mt-8 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Suivi de tes retraits du mois
                </Text>
              </Section>

              <Section className="mt-28 text-center">
                <Button
                  href={dashboardUrl}
                  className="box-border inline-block rounded-10 bg-emerald-500 px-28 py-14 text-15 font-semibold text-white no-underline"
                >
                  Voir mon montant retirable →
                </Button>
              </Section>

              <Text className="mt-24 text-13 leading-20 text-slate-500">
                Ton essai gratuit de 30 jours a démarré. Aucune carte bancaire
                requise, annulable à tout moment.
              </Text>
            </Section>

            {/* Footer */}
            <Hr className="m-0 border-none border-t border-solid border-slate-200" />
            <Section className="rounded-b-16 bg-white px-32 py-24 text-center">
              <Text className="m-0 text-12 text-slate-400">
                Une question ?{" "}
                <a
                  href="mailto:hello@safewithdraw.app"
                  className="text-slate-500 underline"
                >
                  hello@safewithdraw.app
                </a>
              </Text>
              <Text className="m-0 mt-8 text-12 text-slate-400">
                SafeWithdraw — Tu peux te désinscrire à tout moment.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

WelcomeEmail.PreviewProps = {
  dashboardUrl: "https://safewithdraw.app/dashboard",
} satisfies WelcomeEmailProps;
