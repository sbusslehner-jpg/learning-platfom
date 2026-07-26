import { useEffect, useState } from "react";
import {
  AlertCircle, BarChart3, CheckCircle2, CircleDashed, Globe, History, Languages, Layers, ShieldCheck,
} from "lucide-react";
import { Breadcrumb } from "../components/Breadcrumb";
import { EmptyState } from "../components/EmptyState";
import { ProgressBar } from "../components/ProgressBar";
import { useT } from "../i18n";
import {
  fetchContentHealth, fetchLearningActivity, fetchMarketCoverage, fetchTranslationHealth,
  type ActivityRow, type ContentHealthRow, type MarketCoverageRow, type TranslationHealthRow,
} from "../data/api";

// ─── Auswertungen ─────────────────────────────────────────────────────────────
// Ausschließlich aggregierte Kennzahlen (Konzept: kein personenbezogenes
// Lern-Reporting). Alle Zahlen kommen aus den report_*-Views in Supabase –
// ohne Datenbank werden keine Zahlen erfunden, sondern ein Hinweis gezeigt.

// ─── Bausteine ────────────────────────────────────────────────────────────────

function Shimmer({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-[#EEF1F4] ${className}`} aria-hidden="true" />;
}

function KpiTile({ label, value, sub, loading }: {
  label: string; value?: string; sub?: React.ReactNode; loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-[#C3C9D1] p-5 shadow-sm">
      {loading ? (
        <>
          <Shimmer className="h-7 w-20" />
          <Shimmer className="h-3 w-28 mt-3" />
        </>
      ) : (
        <>
          <div className="text-[28px] leading-none font-semibold text-[#232830] tabular-nums">{value ?? "–"}</div>
          <div className="text-[11px] font-semibold text-[#5A6472] uppercase tracking-wide mt-2.5">{label}</div>
          {sub && <div className="text-[12px] text-[#8A93A0] mt-1.5 leading-snug">{sub}</div>}
        </>
      )}
    </div>
  );
}

function Section({ icon: Icon, title, description, children }: {
  icon: React.ElementType; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-xl border border-[#C3C9D1] overflow-hidden shadow-sm">
      <div className="px-5 py-4 border-b border-[#EEF1F4] flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-[#E6FAF9] flex items-center justify-center shrink-0">
          <Icon size={16} style={{ color: "#007D78" }} />
        </div>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold text-[#232830]">{title}</h2>
          <p className="text-[13px] text-[#5A6472] mt-0.5">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const TH_BASE = "px-4 py-3 text-[12px] font-semibold text-[#5A6472] uppercase tracking-wide whitespace-nowrap";

function NoRows({ label }: { label: string }) {
  return <div className="px-5 py-8 text-center text-[13px] text-[#5A6472]">{label}</div>;
}

/** Kleines Zählerchen mit Farbe *und* Text/Icon (Status nie nur über Farbe). */
function Count({ icon: Icon, color, children }: { icon: React.ElementType; color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium whitespace-nowrap" style={{ color }}>
      <Icon size={12} />{children}
    </span>
  );
}

// ─── Seite ────────────────────────────────────────────────────────────────────

export function ReportingPage() {
  const { t, lang } = useT();
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState<ContentHealthRow[] | null>(null);
  const [translation, setTranslation] = useState<TranslationHealthRow[] | null>(null);
  const [markets, setMarkets] = useState<MarketCoverageRow[] | null>(null);
  const [activity, setActivity] = useState<ActivityRow | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([
      fetchContentHealth().catch(() => null),
      fetchTranslationHealth().catch(() => null),
      fetchMarketCoverage().catch(() => null),
      fetchLearningActivity().catch(() => null),
    ]).then(([c, tr, m, a]) => {
      if (!alive) return;
      setContent(c); setTranslation(tr); setMarkets(m); setActivity(a);
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  const num = (n: number | null | undefined) =>
    typeof n === "number" ? n.toLocaleString(lang) : "–";

  const sum = (rows: ContentHealthRow[] | null, pick: (r: ContentHealthRow) => number) =>
    rows ? rows.reduce((acc, r) => acc + (pick(r) ?? 0), 0) : null;

  const published = sum(content, r => r.trainings_published);
  const drafts = sum(content, r => r.trainings_draft);

  const nothingAvailable = !loading && !content && !translation && !markets && !activity;

  return (
    <div className="flex-1 overflow-y-auto p-6 lg:p-8">
      <Breadcrumb items={["Verwaltung", t("report.title")]} />

      <div className="mb-6">
        <h1 className="text-[26px] font-semibold text-[#232830]">{t("report.title")}</h1>
        <p className="text-[14px] text-[#5A6472] mt-1">{t("report.subtitle")}</p>
      </div>

      {/* Datenschutz-Hinweis: harte Produktentscheidung, deshalb dauerhaft sichtbar */}
      <div className="flex items-start gap-2.5 px-4 py-3 mb-6 rounded-lg bg-[#EBF1FE] border border-[#1D5BD6]/20">
        <ShieldCheck size={16} className="text-[#1D5BD6] shrink-0 mt-0.5" />
        <p className="text-[13px] text-[#1D5BD6] leading-snug">{t("report.privacyNote")}</p>
      </div>

      {nothingAvailable ? (
        <div className="bg-white rounded-xl border border-[#C3C9D1] shadow-sm">
          <EmptyState
            icon={BarChart3}
            title={t("common.dbRequired")}
            body="Die Auswertungen lesen ausschließlich die aggregierten report-Views der Datenbank. Ohne verbundene Supabase-Instanz werden hier bewusst keine Zahlen angezeigt."
          />
        </div>
      ) : (
        <div className="space-y-6">

          {/* ── KPI-Kacheln ── */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiTile loading={loading} label={t("report.trainingsPublished")} value={num(published)} />
            <KpiTile loading={loading} label={t("report.trainingsDraft")} value={num(drafts)} />
            <KpiTile
              loading={loading}
              label={t("report.activeLearners")}
              value={num(activity?.active_learners)}
              sub="Summenwert – ohne Personenbezug"
            />
            <KpiTile
              loading={loading}
              label={t("report.chaptersCompleted")}
              value={num(activity?.chapters_completed)}
              sub={activity ? (
                <>
                  <span className="tabular-nums">+{num(activity.completed_last_7d)}</span> {t("report.last7d")}
                  {" · "}
                  <span className="tabular-nums">+{num(activity.completed_last_30d)}</span> {t("report.last30d")}
                </>
              ) : undefined}
            />
          </div>

          {/* ── Übersetzungsstatus: eine Zeile je Sprache (nie Spalten) ── */}
          {loading ? (
            <Section icon={Languages} title={t("report.translationHealth")} description="Aktuelle Felder je Sprache">
              <div className="divide-y divide-[#EEF1F4]">
                {[0, 1, 2, 3].map(i => (
                  <div key={i} className="px-5 py-4 flex items-center gap-4">
                    <Shimmer className="h-5 w-9" />
                    <Shimmer className="h-4 w-28" />
                    <Shimmer className="h-1.5 flex-1" />
                    <Shimmer className="h-4 w-16" />
                  </div>
                ))}
              </div>
            </Section>
          ) : translation && (
            <Section
              icon={Languages}
              title={t("report.translationHealth")}
              description="Je Sprache: aktuelle Felder gegenüber allen übersetzbaren Feldern"
            >
              {translation.length === 0 ? <NoRows label={t("common.noResults")} /> : (
                <div className="divide-y divide-[#EEF1F4]">
                  {[...translation]
                    .sort((a, b) => {
                      const pa = a.fields_total ? a.fields_current / a.fields_total : 0;
                      const pb = b.fields_total ? b.fields_current / b.fields_total : 0;
                      return pa - pb || a.language_name.localeCompare(b.language_name);
                    })
                    .map(r => {
                      const percent = r.fields_total > 0 ? Math.round((r.fields_current / r.fields_total) * 100) : 0;
                      const clean = !r.fields_outdated && !r.fields_error && !r.fields_missing;
                      return (
                        <div key={r.language_code} className="px-5 py-3.5 hover:bg-[#F6F8FA] transition-colors">
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                            <span className="font-mono text-[12px] font-bold text-[#5A6472] bg-[#EEF1F4] px-1.5 py-0.5 rounded shrink-0">
                              {r.language_code.toUpperCase()}
                            </span>
                            <span className="text-[14px] font-medium text-[#232830] sm:w-32 shrink-0">{r.language_name}</span>
                            <div className="flex items-center gap-3 flex-1 min-w-[140px]">
                              <ProgressBar percent={percent} className="flex-1" />
                              <span className="text-[13px] font-semibold text-[#3A424E] tabular-nums w-10 text-right">{percent}%</span>
                            </div>
                            <span className="text-[13px] text-[#5A6472] tabular-nums w-24 text-right shrink-0">
                              {num(r.fields_current)}/{num(r.fields_total)}
                            </span>
                            <div className="flex items-center gap-3 flex-wrap justify-end sm:min-w-[210px]">
                              {clean && <Count icon={CheckCircle2} color="#15803D">vollständig</Count>}
                              {r.fields_outdated > 0 && <Count icon={History} color="#B45309">{num(r.fields_outdated)} veraltet</Count>}
                              {r.fields_error > 0 && <Count icon={AlertCircle} color="#B42318">{num(r.fields_error)} Fehler</Count>}
                              {r.fields_missing > 0 && <Count icon={CircleDashed} color="#5A6472">{num(r.fields_missing)} fehlend</Count>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </Section>
          )}

          {/* ── Inhaltsbestand ── */}
          {loading ? (
            <Section icon={Layers} title={t("report.contentHealth")} description="Trainings und Kapitel je Modul">
              <div className="divide-y divide-[#EEF1F4]">
                {[0, 1, 2].map(i => (
                  <div key={i} className="px-4 py-4"><Shimmer className="h-4 w-full max-w-md" /></div>
                ))}
              </div>
            </Section>
          ) : content && (
            <Section icon={Layers} title={t("report.contentHealth")} description="Trainings und Kapitel je Modul">
              {content.length === 0 ? <NoRows label={t("common.noResults")} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
                        <th scope="col" className={`text-left ${TH_BASE}`}>Modul</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>Trainings</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>Veröffentlicht</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>Entwürfe</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>Kapitel</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF1F4]">
                      {content.map((r, i) => (
                        <tr key={`${r.product}-${r.module}-${i}`} className="hover:bg-[#F6F8FA] transition-colors">
                          <td className="px-4 py-3">
                            <div className="text-[10px] font-bold text-[#8A93A0] uppercase tracking-wider">{r.product}</div>
                            <div className="text-[14px] font-medium text-[#232830]">{r.module}</div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#3A424E]">{num(r.trainings_total)}</td>
                          <td className="px-4 py-3 text-right tabular-nums font-semibold text-[#15803D]">{num(r.trainings_published)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#5A6472]">{num(r.trainings_draft)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#5A6472]">{num(r.chapters_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-[#E1E5EA] bg-[#F6F8FA]">
                        <td className="px-4 py-3 text-[13px] font-semibold text-[#232830]">Summe</td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#232830] tabular-nums">{num(sum(content, r => r.trainings_total))}</td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#232830] tabular-nums">{num(published)}</td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#232830] tabular-nums">{num(drafts)}</td>
                        <td className="px-4 py-3 text-right text-[13px] font-semibold text-[#232830] tabular-nums">{num(sum(content, r => r.chapters_total))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </Section>
          )}

          {/* ── Marktabdeckung ── */}
          {loading ? (
            <Section icon={Globe} title={t("report.marketCoverage")} description="Zugeordnete Trainings, Sprachen und Benutzer je Markt">
              <div className="divide-y divide-[#EEF1F4]">
                {[0, 1, 2].map(i => (
                  <div key={i} className="px-4 py-4"><Shimmer className="h-4 w-full max-w-md" /></div>
                ))}
              </div>
            </Section>
          ) : markets && (
            <Section icon={Globe} title={t("report.marketCoverage")} description="Zugeordnete Trainings, Sprachen und Benutzer je Markt">
              {markets.length === 0 ? <NoRows label={t("common.noResults")} /> : (
                <div className="overflow-x-auto">
                  <table className="w-full text-[14px]">
                    <thead>
                      <tr className="border-b border-[#E1E5EA] bg-[#F6F8FA]">
                        <th scope="col" className={`text-left ${TH_BASE}`}>{t("report.markets")}</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>Zugeordnete Trainings</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>{t("report.languages")}</th>
                        <th scope="col" className={`text-right ${TH_BASE}`}>Benutzer</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#EEF1F4]">
                      {markets.map(r => (
                        <tr key={r.market_code} className="hover:bg-[#F6F8FA] transition-colors">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-[12px] font-bold text-[#5A6472] bg-[#EEF1F4] px-1.5 py-0.5 rounded">{r.market_code}</span>
                              <span className="text-[14px] font-medium text-[#232830]">{r.market_name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#3A424E]">{num(r.trainings_assigned)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#5A6472]">{num(r.languages)}</td>
                          <td className="px-4 py-3 text-right tabular-nums text-[#5A6472]">{num(r.users)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>
          )}

        </div>
      )}
    </div>
  );
}
