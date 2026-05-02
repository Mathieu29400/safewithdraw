import Link from "next/link";

export default function HomePage() {
  return (
    <main className="relative overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[32rem] bg-[radial-gradient(ellipse_55%_45%_at_50%_0%,rgba(16,185,129,0.20),transparent_70%)]"
      />

      <div className="mx-auto w-full max-w-6xl px-4 pb-20 pt-10 sm:px-6 sm:pt-14">
        <header className="flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight text-slate-100">
            SafeWithdraw
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-sm text-slate-300 transition hover:bg-white/5 hover:text-slate-100"
            >
              Connexion
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-medium text-white shadow-[0_8px_24px_-8px_rgba(16,185,129,0.7)] transition hover:bg-emerald-400"
            >
              Créer un compte
            </Link>
          </div>
        </header>

        <section className="mx-auto mt-16 max-w-4xl text-center sm:mt-20">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-50 sm:text-6xl">
            Sache exactement combien tu peux te verser, à tout moment.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base text-slate-300 sm:text-lg">
            SafeWithdraw calcule en temps réel ce que tu peux retirer sans te
            mettre en danger (URSSAF incluse).
          </p>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-6 py-3 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(16,185,129,0.8)] transition hover:scale-[1.01] hover:bg-emerald-400"
            >
              Calculer mon montant retirable
            </Link>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Utilisé par des freelances pour sécuriser leurs retraits en toute
            sécurité • Sans engagement
          </p>
          <p className="mx-auto mt-3 inline-flex items-center rounded-full bg-emerald-500/10 px-4 py-1.5 text-sm font-medium text-emerald-200 ring-1 ring-emerald-400/25">
            Sans carte bancaire • Accès immédiat • Sans engagement
          </p>
        </section>

        <section className="mt-20 grid gap-6 rounded-2xl bg-slate-900/45 p-6 ring-1 ring-white/10 backdrop-blur-xl sm:grid-cols-2 sm:p-8">
          <div>
            <h2 className="text-2xl font-semibold text-slate-100">
              Tu encaisses de l’argent mais tu ne sais jamais combien tu peux te
              payer.
            </h2>
            <ul className="mt-5 space-y-3 text-slate-300">
              <li>• Tu retires trop → problème URSSAF</li>
              <li>• Tu retires pas assez → frustration</li>
              <li>• Tu fais des calculs en permanence</li>
            </ul>
          </div>
          <div className="rounded-xl bg-white/[0.03] p-5 ring-1 ring-white/10">
            <p className="text-sm uppercase tracking-[0.16em] text-emerald-300/80">
              Solution
            </p>
            <h3 className="mt-2 text-xl font-semibold text-slate-100">
              SafeWithdraw te donne une réponse instantanée :
            </h3>
            <p className="mt-3 text-2xl font-semibold text-emerald-300">
              Tu peux te verser X€ maintenant
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-300">
              <li>• calcul URSSAF automatique</li>
              <li>• réserve de sécurité recommandée (10 %)</li>
              <li>• mise à jour en temps réel</li>
            </ul>
          </div>
        </section>

        <section className="mt-12">
          <h2 className="text-center text-2xl font-semibold text-slate-100 sm:text-3xl">
            Preuve produit
          </h2>
          <div className="mt-8 rounded-2xl bg-slate-900/50 p-4 ring-1 ring-white/10 backdrop-blur-xl sm:p-6">
            <div className="rounded-xl bg-black/40 p-5 ring-1 ring-white/10">
              <p className="text-[11px] uppercase tracking-[0.16em] text-emerald-300/80">
                Montant retirable
              </p>
              <p className="mt-2 text-4xl font-semibold tabular-nums text-emerald-200 sm:text-5xl">
                2 480,00 €
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <ProofTile label="CA" value="7 800,00 €" tone="positive" />
                <ProofTile
                  label="URSSAF"
                  value="−1 996,80 €"
                  tone="negative"
                />
                <ProofTile
                  label="Réserve de sécurité recommandée"
                  value="−780,00 €"
                  tone="negative"
                />
                <ProofTile
                  label="Retraits"
                  value="−2 543,20 €"
                  tone="negative"
                />
              </div>

              <div className="mt-6 rounded-xl bg-slate-950/70 p-4 ring-1 ring-white/10">
                <p className="text-xs text-slate-400">Cashflow</p>
                <svg
                  viewBox="0 0 600 230"
                  className="mt-2 h-44 w-full"
                  role="img"
                  aria-label="Graphique d'évolution du cashflow"
                >
                  <defs>
                    <linearGradient id="cashfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Axes labels like dashboard preview */} 
                  <text x="8" y="36" fill="#64748b" fontSize="11">3k €</text>
                  <text x="8" y="95" fill="#64748b" fontSize="11">2k €</text>
                  <text x="8" y="154" fill="#64748b" fontSize="11">1k €</text>
                  <line x1="52" y1="30" x2="585" y2="30" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" />
                  <line x1="52" y1="90" x2="585" y2="90" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" />
                  <line x1="52" y1="150" x2="585" y2="150" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" />
                  <path
                    d="M52,172 C110,128 145,136 185,101 C225,76 276,92 320,79 C365,65 410,78 452,52 C500,28 548,42 580,32 L580,190 L52,190 Z"
                    fill="url(#cashfill)"
                  />
                  <path
                    d="M52,172 C110,128 145,136 185,101 C225,76 276,92 320,79 C365,65 410,78 452,52 C500,28 548,42 580,32"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <text x="60" y="214" fill="#64748b" fontSize="11">01 avr</text>
                  <text x="240" y="214" fill="#64748b" fontSize="11">12 avr</text>
                  <text x="420" y="214" fill="#64748b" fontSize="11">24 avr</text>
                  <text x="550" y="214" fill="#64748b" fontSize="11">30 avr</text>
                </svg>
              </div>
            </div>
            <p className="mt-4 text-center text-sm text-slate-400">
              Une vue claire, en temps réel, sans calculs.
            </p>
          </div>
        </section>

        <section className="mt-20 rounded-2xl bg-slate-900/45 p-6 ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
          <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">
            Pourquoi tu peux faire confiance aux calculs
          </h2>
          <ul className="mt-5 space-y-3 text-slate-300">
            <li>• Basé sur ton chiffre d’affaires réel</li>
            <li>• Calcul URSSAF automatique selon ton activité</li>
            <li>• Mise à jour instantanée à chaque mouvement</li>
          </ul>
          <p className="mt-5 text-sm text-slate-400">
            Aucun calcul approximatif. Tout est transparent.
          </p>
        </section>

        <section className="mt-24 rounded-2xl bg-slate-950/50 px-6 py-10 text-center ring-1 ring-white/10 sm:mt-24 sm:px-10 sm:py-12">
          <p className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            Chaque jour sans SafeWithdraw signifie :
          </p>
          <div className="mx-auto mt-6 max-w-2xl space-y-3">
            <p className="text-2xl font-medium text-slate-100 sm:text-3xl">
              soit tu te verses <span className="text-rose-300">trop</span>
            </p>
            <p className="text-2xl font-medium text-slate-100 sm:text-3xl">
              soit tu ne te paies <span className="text-amber-200">pas assez</span>
            </p>
          </div>
        </section>

        <section className="mt-20">
          <p className="mx-auto flex w-fit items-center justify-center rounded-full bg-white/[0.03] px-3 py-1 text-center text-sm text-slate-300 ring-1 ring-white/10">
            +120 freelances utilisent SafeWithdraw pour sécuriser leurs retraits
          </p>

          <div className="mt-10 grid gap-4 sm:mt-12 sm:grid-cols-2 sm:gap-6">
            <figure className="rounded-2xl bg-slate-900/45 p-6 text-center ring-1 ring-white/10 backdrop-blur-xl">
              <blockquote className="text-base italic text-slate-200">
                « Depuis que j’utilise SafeWithdraw, je sais exactement combien je
                peux me verser sans stress. Ça m’a évité plusieurs erreurs. »
              </blockquote>
              <figcaption className="mt-4 text-sm text-slate-400">
                — Thomas, freelance
              </figcaption>
            </figure>

            <figure className="rounded-2xl bg-slate-900/45 p-6 text-center ring-1 ring-white/10 backdrop-blur-xl">
              <blockquote className="text-base italic text-slate-200">
                « Avant SafeWithdraw, je faisais mes calculs à la main et j’étais
                jamais sûr. Maintenant je sais exactement combien me verser. »
              </blockquote>
              <figcaption className="mt-4 text-sm text-slate-400">
                — Julien, développeur freelance
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="mx-auto mt-20 max-w-2xl rounded-3xl bg-slate-900/55 p-8 text-center ring-1 ring-white/10 backdrop-blur-xl">
          <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-400/30">
            Offre de lancement
          </span>
          <div className="mt-6">
            <p className="text-lg text-slate-500 line-through">29€/mois</p>
            <p className="mt-1 text-6xl font-semibold tracking-tight text-emerald-300 sm:text-7xl">
              19€/mois
            </p>
          </div>
          <p className="mt-4 text-base text-slate-200">
            Moins qu’une seule erreur de retrait
          </p>
          <p className="mt-2 text-sm text-slate-400">
            Paiement sécurisé via Paddle • Facturation automatique • Annulable à
            tout moment
          </p>

          <div className="mt-6 rounded-xl bg-emerald-500/10 p-4 ring-1 ring-emerald-400/25">
            <p className="text-xl font-semibold text-emerald-200">
              30 jours gratuits
            </p>
            <p className="mt-1 text-sm text-slate-300">
              Teste gratuitement. Tu peux arrêter à tout moment.
            </p>
          </div>

          <p className="mt-4 text-xs text-slate-500">
            Mode avancé disponible pour affiner les calculs (dépenses, précision)
          </p>
        </section>

        <section className="mt-20 rounded-2xl bg-slate-900/45 p-6 ring-1 ring-white/10 backdrop-blur-xl sm:p-8">
          <h2 className="text-2xl font-semibold text-slate-100 sm:text-3xl">
            Pourquoi les freelances utilisent SafeWithdraw
          </h2>
          <ul className="mt-5 grid gap-3 text-slate-300 sm:grid-cols-2">
            <li>• Évite les erreurs URSSAF</li>
            <li>• Sait exactement combien se payer</li>
            <li>• Gagne du temps chaque semaine</li>
            <li>• Réduit le stress financier</li>
          </ul>
        </section>

        <section className="mt-20 text-center">
          <h2 className="mx-auto max-w-3xl text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
            Arrête de te poser des questions. Sais combien te verser maintenant.
          </h2>
          <div className="mt-8">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-xl bg-emerald-500 px-7 py-3 text-base font-semibold text-white shadow-[0_14px_30px_-12px_rgba(16,185,129,0.8)] transition hover:scale-[1.01] hover:bg-emerald-400"
            >
              Essayer SafeWithdraw
            </Link>
          </div>
          <p className="mt-3 text-sm text-slate-400">
            Sans carte bancaire • Accès immédiat
          </p>
        </section>
      </div>
    </main>
  );
}

function ProofTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  const valueColor = tone === "positive" ? "text-emerald-300" : "text-rose-300";

  return (
    <div className="rounded-lg bg-white/[0.03] p-3 ring-1 ring-white/10">
      <p className="text-[10px] uppercase leading-tight tracking-[0.12em] text-slate-500 sm:tracking-[0.16em]">
        {label}
      </p>
      <p className={`mt-2 text-sm font-medium tabular-nums ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}
