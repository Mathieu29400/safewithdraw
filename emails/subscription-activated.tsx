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

interface SubscriptionActivatedEmailProps {
  dashboardUrl?: string;
}

export default function SubscriptionActivatedEmail({
  dashboardUrl = "https://safewithdraw.app/dashboard",
}: SubscriptionActivatedEmailProps) {
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
        <Preview>Ton abonnement SafeWithdraw Pro est activé 🚀</Preview>
        <Body className="bg-slate-50 font-sans">
          <Container className="mx-auto max-w-600 py-40">
            {/* Header */}
            <Section className="rounded-t-16 bg-slate-900 px-32 py-28 text-center">
              <Text className="m-0 text-20 font-semibold tracking-tight text-white">
                SafeWithdraw
              </Text>
              <Text className="m-0 mt-4 text-12 uppercase tracking-widest text-emerald-400">
                Pro · Abonnement actif
              </Text>
            </Section>

            {/* Green accent bar */}
            <Section className="bg-emerald-500 px-0 py-4" />

            {/* Body */}
            <Section className="bg-white px-32 py-32">
              <Heading className="m-0 text-28 font-semibold text-slate-900">
                Ton abonnement est activé 🎉
              </Heading>
              <Text className="mt-16 text-16 leading-24 text-slate-600">
                Tu as maintenant accès complet à SafeWithdraw pour suivre ton
                montant retirable en temps réel, sans risque.
              </Text>

              <Section className="mt-28 text-center">
                <Button
                  href={dashboardUrl}
                  className="box-border inline-block rounded-10 bg-emerald-500 px-28 py-14 text-15 font-semibold text-white no-underline"
                >
                  Accède à ton dashboard →
                </Button>
              </Section>

              <Section className="mt-28 rounded-12 bg-slate-50 px-24 py-20">
                <Text className="m-0 text-11 font-semibold uppercase tracking-widest text-slate-400">
                  Petit rappel
                </Text>
                <Text className="m-0 mt-12 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Calcul URSSAF automatique
                </Text>
                <Text className="m-0 mt-8 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Réserve de sécurité incluse
                </Text>
                <Text className="m-0 mt-8 text-14 leading-22 text-slate-700">
                  ✓&nbsp; Suivi de tes retraits
                </Text>
              </Section>

              <Text className="mt-28 text-14 leading-22 text-slate-600">
                Si tu as la moindre question :{" "}
                <a
                  href="mailto:safewithdraw.contact@gmail.com"
                  className="text-emerald-600 underline"
                >
                  safewithdraw.contact@gmail.com
                </a>
              </Text>

              <Text className="mt-24 text-14 leading-22 text-slate-600">
                À très vite,
                <br />
                L’équipe SafeWithdraw
              </Text>
            </Section>

            {/* Footer */}
            <Hr className="m-0 border-none border-t border-solid border-slate-200" />
            <Section className="rounded-b-16 bg-white px-32 py-24 text-center">
              <Text className="m-0 text-12 text-slate-400">
                Une question ?{" "}
                <a
                  href="mailto:safewithdraw.contact@gmail.com"
                  className="text-slate-500 underline"
                >
                  safewithdraw.contact@gmail.com
                </a>
              </Text>
              <Text className="m-0 mt-8 text-12 text-slate-400">
                SafeWithdraw — Tu peux gérer ou résilier ton abonnement à tout
                moment depuis ton dashboard.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

SubscriptionActivatedEmail.PreviewProps = {
  dashboardUrl: "https://safewithdraw.app/dashboard",
} satisfies SubscriptionActivatedEmailProps;
