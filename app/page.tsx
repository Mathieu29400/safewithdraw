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
              <li>• calcul URSSAF automatique (mensuel ou trimestriel)</li>
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
                2 023,20 €
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Exemple : 9 360 € TTC encaissés (TVA 20 %) et 600 € TTC de dépenses
                pro (TVA récupérable 20 %).
              </p>

              {/* Same tile organisation as the actual dashboard breakdown:
                  primary row (CA HT, URSSAF, réserve), secondary row
                  (retraits, dépenses HT) and a VAT row that only appears
                  when relevant — here it always is because the example
                  carries VAT on both incomes and expenses. */}
              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <ProofTile label="CA HT" value="7 800,00 €" tone="positive" />
                <ProofTile
                  label="Charges URSSAF estimées (25,6 %)"
                  value="−1 996,80 €"
                  tone="negative"
                />
                <ProofTile
                  label="Réserve de sécurité recommandée (10 %)"
                  value="−780,00 €"
                  tone="negative"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ProofTile
                  label="Déjà retiré"
                  value="−2 500,00 €"
                  tone="negative"
                />
                <ProofTile
                  label="Dépenses HT"
                  value="−500,00 €"
                  tone="negative"
                />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <ProofTile
                  label="TVA à reverser estimée"
                  value="1 560,00 €"
                  tone="neutral"
                />
                <ProofTile
                  label="TVA récupérable estimée"
                  value="100,00 €"
                  tone="neutral"
                />
              </div>

              <div className="mt-6 rounded-xl bg-slate-950/70 p-4 ring-1 ring-white/10">
                <p className="text-xs text-slate-400">Évolution du montant retirable</p>
                <svg
                  viewBox="0 0 600 230"
                  className="mt-2 h-44 w-full"
                  role="img"
                  aria-label="Graphique d'évolution du montant retirable"
                >
                  <defs>
                    <linearGradient id="withdrawablefill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity="0.45" />
                      <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {/* Y-axis rescaled to the new safe-withdrawable range
                      (~2 k € peak) so the curve reads in line with the
                      hero number above. The grid lines stay where they
                      were; only the labels and the path's vertical
                      amplitude are tuned. */}
                  <text x="8" y="36" fill="#64748b" fontSize="11">2k €</text>
                  <text x="8" y="95" fill="#64748b" fontSize="11">1,5k €</text>
                  <text x="8" y="154" fill="#64748b" fontSize="11">1k €</text>
                  <line x1="52" y1="30" x2="585" y2="30" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" />
                  <line x1="52" y1="90" x2="585" y2="90" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" />
                  <line x1="52" y1="150" x2="585" y2="150" stroke="#334155" strokeWidth="1" strokeDasharray="3 4" />
                  <path
                    d="M52,172 C110,128 145,136 185,101 C225,76 276,92 320,79 C365,65 410,78 452,52 C500,28 548,42 580,32 L580,190 L52,190 Z"
                    fill="url(#withdrawablefill)"
                  />
                  <path
                    d="M52,172 C110,128 145,136 185,101 C225,76 276,92 320,79 C365,65 410,78 452,52 C500,28 548,42 580,32"
                    fill="none"
                    stroke="#34d399"
                    strokeWidth="4"
                    strokeLinecap="round"
                  />
                  <text x="60" y="214" fill="#64748b" fontSize="11">01 mai</text>
                  <text x="240" y="214" fill="#64748b" fontSize="11">12 mai</text>
                  <text x="420" y="214" fill="#64748b" fontSize="11">24 mai</text>
                  <text x="550" y="214" fill="#64748b" fontSize="11">31 mai</text>
                </svg>
              </div>
            </div>
            <p className="mt-4 text-center text-xs text-slate-500">
              Exemple pour un freelance avec un taux URSSAF de 25,6 % et de la TVA
              à 20 % sur le CA et les dépenses pro. Le calcul automatique
              fonctionne aussi avec les autres taux URSSAF (12,3 %, 21,2 %, 23,2 %…)
              et de TVA (10 %, 5,5 %), ou sans TVA si tu n’es pas redevable.
            </p>
          </div>
        </section>

        <section className="mt-16 sm:mt-20">
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-500/[0.12] via-slate-900/55 to-slate-900/55 p-6 ring-1 ring-emerald-400/30 backdrop-blur-xl sm:p-8">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 -right-12 h-48 w-48 rounded-full bg-emerald-500/15 blur-3xl"
            />
            <div className="relative flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:gap-6">
              <span
                aria-hidden
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-emerald-500/15 ring-1 ring-emerald-400/30"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-emerald-300"
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                  <line x1="16" y1="2" x2="16" y2="6" />
                  <line x1="8" y1="2" x2="8" y2="6" />
                  <line x1="3" y1="10" x2="21" y2="10" />
                  <path d="M8 14h.01" />
                  <path d="M12 14h.01" />
                  <path d="M16 14h.01" />
                  <path d="M8 18h.01" />
                  <path d="M12 18h.01" />
                </svg>
              </span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-300 ring-1 ring-emerald-400/30">
                  Spécifique micro-entrepreneur
                </span>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                  Calcul URSSAF automatique (mensuel ou trimestriel)
                </h3>
                <p className="mt-2 text-base text-slate-300 sm:text-lg">
                  Adapté à ton rythme de déclaration.
                </p>
              </div>
            </div>
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
  /**
   * Same tone palette as the in-app `BreakdownTile`:
   *   positive → emerald (CA HT, montant retirable)
   *   negative → rose    (URSSAF, réserve, retraits, dépenses HT)
   *   neutral  → slate   (TVA à reverser / récupérable estimées — purely
   *                       informational, not added/subtracted from safe).
   */
  tone: "positive" | "negative" | "neutral";
}) {
  const valueColor =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-rose-300"
        : "text-slate-200";

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
