import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  Panel,
  useNodesState,
  useEdgesState,
} from "reactflow";
import "reactflow/dist/style.css";
import {
  forceSimulation,
  forceManyBody,
  forceLink as d3ForceLink,
  forceCenter,
  forceCollide,
} from "d3-force";

/**
 * Shinri — Venezuela / Maduro Knowledge Graph (Expanded)
 * Refined from Reuters, AP, NYT, WSJ, FT, BBC, Bloomberg, The Economist,
 * Foreign Policy, CFR, ICG, Atlantic Council, ACLED, Al Jazeera, CNBC, RAND,
 * CSIS, Lancet, UNICEF, WFP, IOM, Oxford Law, IMF, World Bank (2024-2026).
 *
 * Entity types: person | country | organization | event | macro_index |
 *               policy | activity | institution | feature
 * Edge schema:  { source, target, relation: positive|negative|neutral, description }
 * Mentions:     1-10 frequency scale across sources
 */

// ----------------------------
// Entities
// ----------------------------
const NODES = [
  // ── People ──
  { id: "nicolas_maduro", label: "Nicolás Maduro", type: "person", mentions: 10, description: "Former president of Venezuela. Captured by US forces in Operation Absolute Resolve (Jan 3 2026). Indicted on narco-terrorism charges in SDNY." },
  { id: "cilia_flores", label: "Cilia Flores", type: "person", mentions: 3, description: "Maduro's wife. Captured alongside him. Co-defendant in US federal narco-terrorism case." },
  { id: "delcy_rodriguez", label: "Delcy Rodríguez", type: "person", mentions: 7, description: "Vice president sworn in as acting president Jan 5 2026. Pursuing cautious reform strategy while stalling deeper democratic transition." },
  { id: "diosdado_cabello", label: "Diosdado Cabello", type: "person", mentions: 7, description: "Interior minister and key power broker. Linked to Cartel de los Soles, Tren de Aragua operations, and mass detention campaigns." },
  { id: "vladimir_padrino_lopez", label: "Vladimir Padrino López", type: "person", mentions: 4, description: "Defense minister. Backed Rodríguez transition, securing military endorsement of succession." },
  { id: "maria_corina_machado", label: "María Corina Machado", type: "person", mentions: 8, description: "Opposition leader. Won 2025 Nobel Peace Prize. 72% approval rating. Banned from running in 2024 election but led opposition campaign." },
  { id: "edmundo_gonzalez", label: "Edmundo González Urrutia", type: "person", mentions: 6, description: "Opposition president-elect. Won July 2024 election by 2:1 margin per opposition tallies. In exile in Madrid." },
  { id: "donald_trump", label: "Donald Trump", type: "person", mentions: 7, description: "US president. Ordered Operation Absolute Resolve. Claimed US would 'run' Venezuela until transition. Designated Cartel de los Soles as FTO." },
  { id: "marco_rubio", label: "Marco Rubio", type: "person", mentions: 3, description: "US Secretary of State. Orchestrated FTO designations and diplomatic strategy against Maduro regime." },
  { id: "hugo_carvajal", label: "Hugo Carvajal", type: "person", mentions: 3, description: "Former Venezuelan military intelligence chief. Cooperating witness in US narco-terrorism case. Provided key testimony for indictment." },

  // ── Countries ──
  { id: "united_states", label: "United States", type: "country", mentions: 8, description: "Executed military capture of Maduro. Maintains OFAC sanctions regime. Seeking oil access and democratic transition." },
  { id: "russia", label: "Russia", type: "country", mentions: 5, description: "Provided arms, military advisors, and diplomatic cover to Maduro. Lost influence after capture. $17B in outstanding loans to Venezuela." },
  { id: "china", label: "China", type: "country", mentions: 6, description: "Purchased ~80% of Venezuelan oil exports. $60B+ in loans. Condemned US operation. Seeks to protect energy investments in transition." },
  { id: "cuba", label: "Cuba", type: "country", mentions: 6, description: "Provided intelligence officers and security advisors. 32 Cuban security personnel killed in Jan 2026 US strikes. Deep institutional ties to Venezuelan military." },
  { id: "iran", label: "Iran", type: "country", mentions: 4, description: "Supplied drones, fast boats, and refinery components. Explored defense cooperation as anti-US alignment. Sanctioned alongside Venezuela." },
  { id: "colombia", label: "Colombia", type: "country", mentions: 5, description: "Hosts 2.8M Venezuelan refugees. Border zones contested by ELN and FARC dissidents. Destabilised by Catatumbo offensive." },
  { id: "brazil", label: "Brazil", type: "country", mentions: 4, description: "Hosts 680K Venezuelan refugees. Condemned US military operation. Roraima state strained by migration." },

  // ── Organizations ──
  { id: "pdvsa", label: "PDVSA", type: "organization", mentions: 6, description: "State oil company. Production collapsed from 3.2M bpd (1998) to ~900K bpd (2025). Core revenue source for regime." },
  { id: "fanb", label: "FANB", type: "organization", mentions: 5, description: "Venezuelan armed forces. Coup-proofed through overlapping command structures, criminal rents, and Cuban intelligence monitoring." },
  { id: "tren_de_aragua", label: "Tren de Aragua", type: "organization", mentions: 7, description: "Transnational criminal gang. Active in 11+ countries, 23 US states. Designated FTO Feb 2025. Used by regime for transnational repression." },
  { id: "colectivos", label: "Colectivos", type: "organization", mentions: 5, description: "Pro-government armed militias. Control territory in Caracas. Used against protesters. Increasingly involved in drug trafficking and extortion." },
  { id: "eln", label: "ELN", type: "organization", mentions: 5, description: "Colombian guerrilla group. Controls territory in Venezuelan border states (Zulia, Apure, Amazonas). Largest non-state armed actor on border." },
  { id: "segunda_marquetalia", label: "Segunda Marquetalia", type: "organization", mentions: 3, description: "FARC dissident group. Lost territory to ELN in 2025 clashes. Second-in-command killed Aug 2025 on Venezuela-Colombia border." },
  { id: "cartel_de_los_soles", label: "Cartel de los Soles", type: "organization", mentions: 6, description: "State narco-trafficking network. Senior military and government officials. Designated FTO Nov 2025. Legal basis for US military action." },
  { id: "psuv", label: "PSUV", type: "organization", mentions: 3, description: "United Socialist Party. Ruling party since Chávez era. Fragmented post-Maduro between reformist and hardline factions." },
  { id: "chevron", label: "Chevron", type: "organization", mentions: 5, description: "Major US oil company. Operated under OFAC license GL41 in Venezuela. License revoked Mar 2025, partially restored Jul 2025." },
  { id: "opec", label: "OPEC", type: "organization", mentions: 3, description: "Oil cartel. Venezuela holds world's largest proven reserves. Production cuts affect global price." },

  // ── Institutions ──
  { id: "cne", label: "CNE", type: "institution", mentions: 3, description: "National Electoral Council. Declared Maduro winner of 2024 election without publishing official tallies. Widely seen as co-opted." },
  { id: "tsj", label: "TSJ", type: "institution", mentions: 3, description: "Supreme Tribunal of Justice. Approved Rodríguez succession. Historically aligned with Chavista government." },
  { id: "us_southern_command", label: "US Southern Command", type: "institution", mentions: 3, description: "US military command responsible for Latin America. Executed Operation Absolute Resolve with 150+ aircraft." },
  { id: "ofac", label: "OFAC", type: "institution", mentions: 4, description: "Office of Foreign Assets Control. Administers Venezuela sanctions. Controls oil license waivers." },

  // ── Events ──
  { id: "election_2024", label: "2024 Presidential Election", type: "event", mentions: 6, description: "Jul 2024 election. Opposition claims González won 2:1. CNE declared Maduro winner without publishing tallies. Triggered international condemnation." },
  { id: "operation_absolute_resolve", label: "Operation Absolute Resolve", type: "event", mentions: 9, description: "Jan 3 2026 US military operation. 150+ aircraft struck 7 military facilities. Maduro captured and transported to USS Iwo Jima en route to NYC." },
  { id: "machado_nobel_prize", label: "Machado Nobel Peace Prize", type: "event", mentions: 5, description: "Dec 2025 Nobel Peace Prize awarded to Machado. Escaped Venezuela by boat to attend ceremony. Daughter accepted on her behalf." },
  { id: "maduro_indictment", label: "Maduro Indictment", type: "event", mentions: 5, description: "SDNY narco-terrorism indictment. $15M bounty raised to $50M. Charges include cocaine trafficking conspiracy and terrorism financing." },
  { id: "catatumbo_offensive", label: "Catatumbo Offensive", type: "event", mentions: 3, description: "Jan 2025 ELN assault on FARC 33rd Front. 78 killed, 50K+ displaced. ELN retook 90% of contested territory." },
  { id: "rodriguez_sworn_in", label: "Rodríguez Sworn In", type: "event", mentions: 6, description: "Jan 5 2026 Delcy Rodríguez proclaimed acting president invoking Art. 233. Backed by TSJ and Defense Minister Padrino López." },
  { id: "prisoner_releases_2026", label: "Political Prisoner Releases", type: "event", mentions: 4, description: "Post-capture release of hundreds of dissidents. Amnesty law making way through legislature as of Feb 2026." },
  { id: "chevron_license_revoked", label: "Chevron License Revoked", type: "event", mentions: 4, description: "Mar 2025 OFAC revoked General License 41 for Chevron. Partially restored Jul 2025 with stricter terms." },
  { id: "us_military_buildup", label: "US Caribbean Buildup", type: "event", mentions: 5, description: "Aug 2025 US deployed warships to southern Caribbean. CIA team tracked Maduro's movements using inside source." },

  // ── Macro Indices ──
  { id: "gdp_growth", label: "GDP Growth", type: "macro_index", mentions: 3, description: "7.7% H1 2025 growth (low base). Economy contracted 80% from 2013-2021. Post-capture outlook uncertain." },
  { id: "inflation_rate", label: "Inflation Rate", type: "macro_index", mentions: 6, description: "556% at end of 2025. Projected 600%+ for 2026. Driven by monetary expansion, supply shortages, and currency collapse." },
  { id: "oil_production", label: "Oil Production", type: "macro_index", mentions: 7, description: "~900K-1M bpd in 2025, down from 3.2M pre-crisis. $10-58B investment needed to restore capacity." },
  { id: "brent_crude_price", label: "Brent Crude Price", type: "macro_index", mentions: 4, description: "$58-60/bbl in late 2025. Venezuelan recovery could add supply pressure. Mid-$50s forecast for 2026." },
  { id: "refugee_count", label: "Refugee Count", type: "macro_index", mentions: 6, description: "7.9M Venezuelans displaced globally. 6.9M in Latin America/Caribbean. Second largest displacement crisis after Syria." },
  { id: "political_prisoner_count", label: "Political Prisoners", type: "macro_index", mentions: 5, description: "1,196 as of Feb 2025. 800+ post-election detainees still held Nov 2025. Releases began after Maduro capture." },
  { id: "poverty_rate", label: "Poverty Rate", type: "macro_index", mentions: 4, description: "70%+ of population earns under $50/month. Minimum wage covers 5.6% of basic food basket." },
  { id: "oil_export_revenue", label: "Oil Export Revenue", type: "macro_index", mentions: 5, description: "Core fiscal revenue. Heavily dependent on China purchases (~80% of exports). Declining since sanctions tightened." },
  { id: "food_security", label: "Food Security", type: "macro_index", mentions: 4, description: "Chronic malnutrition widespread. CLAP food distribution used as political loyalty tool. WFP rates situation as crisis." },

  // ── Policies ──
  { id: "us_sanctions", label: "US Sanctions (OFAC)", type: "policy", mentions: 9, description: "Comprehensive sanctions targeting individuals, PDVSA, oil trade, and financial system. Key lever of US pressure since 2017." },
  { id: "chevron_license", label: "Chevron License (GL41)", type: "policy", mentions: 4, description: "OFAC general license authorising Chevron operations. Revoked Mar 2025, partially restored Jul 2025." },
  { id: "secondary_oil_tariff", label: "25% Secondary Oil Tariff", type: "policy", mentions: 3, description: "Apr 2025 tariff on importers of Venezuelan oil. Targets China, India, other buyers to choke revenue." },
  { id: "fto_designation_tda", label: "Tren de Aragua FTO", type: "policy", mentions: 5, description: "Feb 2025 Foreign Terrorist Organization designation. Enabled Alien Enemies Act invocation and expanded enforcement." },
  { id: "fto_designation_cartel", label: "Cartel de los Soles FTO", type: "policy", mentions: 5, description: "Nov 2025 FTO designation. Reclassified Venezuela from diplomatic dispute to national security threat. Legal basis for military action." },
  { id: "maduro_bounty", label: "$50M Maduro Bounty", type: "policy", mentions: 4, description: "Reward for information leading to arrest. Raised from $15M to $50M. Part of escalating pressure campaign." },
  { id: "operation_knock_knock", label: "Operation Knock Knock", type: "policy", mentions: 3, description: "Post-election mass detention campaign targeting opposition activists, journalists, and protesters. Run by Cabello's interior ministry." },
  { id: "amnesty_law_2026", label: "Amnesty Law 2026", type: "policy", mentions: 3, description: "Post-capture legislation to release political prisoners. Making way through Venezuelan legislature as of Feb 2026." },

  // ── Activities ──
  { id: "drug_trafficking", label: "Drug Trafficking", type: "activity", mentions: 7, description: "Cocaine transshipment through Venezuela estimated at 250+ metric tons/year. Key revenue for military, Cartel de los Soles, and ELN." },
  { id: "mass_migration", label: "Mass Migration", type: "activity", mentions: 6, description: "8M+ Venezuelans have fled since 2014. Largest displacement crisis in Western Hemisphere. Strains host countries." },
  { id: "illegal_gold_mining", label: "Illegal Gold Mining", type: "activity", mentions: 2, description: "Arco Minero region. Military-controlled extraction. Revenue stream for officer corps and armed groups." },
  { id: "transnational_repression", label: "Transnational Repression", type: "activity", mentions: 4, description: "Regime targeting dissidents abroad. Lt. Ronald Ojeda assassinated in Chile (Feb 2024) by Tren de Aragua on regime orders." },
  { id: "political_imprisonment", label: "Political Imprisonment", type: "activity", mentions: 5, description: "Systematic detention of opposition figures, journalists, and protesters. Foro Penal documented 1,196 political prisoners by Feb 2025." },
  { id: "cuban_intelligence", label: "Cuban Intelligence Operations", type: "activity", mentions: 4, description: "Cuban security advisors embedded in Venezuelan military. Monitor officer loyalty. 32 killed in Jan 2026 strikes." },

  // ── Features ──
  { id: "military_loyalty", label: "Military Loyalty", type: "feature", mentions: 6, description: "Coup-proofed through criminal rents, overlapping command, and Cuban surveillance. Never broke ranks despite 2019 and 2024 crises." },
  { id: "press_freedom", label: "Press Freedom", type: "feature", mentions: 2, description: "Among world's lowest. Independent outlets shuttered or self-censoring. Internet shutdowns during protests." },
  { id: "opposition_cohesion", label: "Opposition Cohesion", type: "feature", mentions: 5, description: "Unified around Machado-González ticket in 2024. Post-capture competition between opposition and Rodríguez for power." },
  { id: "regime_stability", label: "Regime Stability", type: "feature", mentions: 7, description: "Composite of military loyalty, institutional control, and popular support. Collapsed after US operation despite decade of coup-proofing." },
  { id: "coup_proofing", label: "Coup-Proofing", type: "feature", mentions: 5, description: "Overlapping security structures, criminal rents binding officers, Cuban intelligence monitoring, and colectivo parallel force." },

  // ══════════════════════════════════════
  // EXPANSION — Upstream & Downstream
  // ══════════════════════════════════════

  // ── People (new) ──
  { id: "chris_wright", label: "Chris Wright", type: "person", mentions: 3, description: "US Energy Secretary. Visited Venezuela post-capture. Leading oil sector reconstruction strategy and sanctions easing." },
  { id: "scott_bessent", label: "Scott Bessent", type: "person", mentions: 3, description: "US Treasury Secretary. Engaged IMF and World Bank leadership on Venezuela economic reconstruction framework." },
  { id: "jose_antonio_kast", label: "José Antonio Kast", type: "person", mentions: 2, description: "Chile's president-elect (2025). Made mass deportation of undocumented Venezuelan migrants a central policy platform." },
  { id: "nino_guerrero", label: "Niño Guerrero", type: "person", mentions: 3, description: "Héctor Guerrero Flores. Leader of Tren de Aragua from Tocorón prison. $4M US bounty. Orchestrated gang's transnational expansion." },

  // ── Countries (new) ──
  { id: "chile", label: "Chile", type: "country", mentions: 4, description: "Hosts Venezuelan migrants. TdA's 'Pirates of Aragua' operate in Santiago and Tarapacá. Lt. Ojeda assassinated there Feb 2024." },
  { id: "peru", label: "Peru", type: "country", mentions: 3, description: "Hosts 1.5M+ Venezuelan migrants. TdA has permanent cells. Tightening immigration enforcement." },
  { id: "ecuador", label: "Ecuador", type: "country", mentions: 2, description: "Terminated 15-year bilateral visa agreement with Venezuela in Sept 2025. Shifting to stricter migration controls." },
  { id: "spain", label: "Spain", type: "country", mentions: 2, description: "Edmundo González in exile in Madrid. Operation Interciti dismantled TdA cell (Nov 2025). 13 arrested for synthetic drug trafficking." },
  { id: "switzerland", label: "Switzerland", type: "country", mentions: 2, description: "Froze assets of Maduro and 35 associates in Jan 2026. Key financial enforcement jurisdiction." },

  // ── Organizations (new) ──
  { id: "exxonmobil", label: "ExxonMobil", type: "organization", mentions: 4, description: "Owed $984.5M from 2007 nationalization. CEO Darren Woods called Venezuela 'uninvestable' without democratic transition. Angered Trump." },
  { id: "conocophillips", label: "ConocoPhillips", type: "organization", mentions: 4, description: "Outstanding arbitration claims approaching $10B from 2007 nationalization. Monitoring developments. Not yet committed to return." },
  { id: "repsol", label: "Repsol", type: "organization", mentions: 3, description: "Spanish energy firm. Holds stakes in Petroquiriquire and Cardón IV. Applied for US export licenses. Operating in Venezuela." },
  { id: "eni", label: "ENI", type: "organization", mentions: 2, description: "Italian energy firm. JV with Repsol on Cardón IV West. Operations proceeding. Applied for US authorization." },
  { id: "ccrc", label: "China Concord Resources", type: "organization", mentions: 2, description: "Chinese state-linked firm. $1B investment in two Venezuelan oil fields. 20-year shared production agreement (May 2024). Target: 60K bpd by end 2026." },
  { id: "sinaloa_cartel", label: "Sinaloa Cartel", type: "organization", mentions: 2, description: "Mexican drug cartel. Strategic alliance with Tren de Aragua for logistics and distribution in US and Mexican markets." },
  { id: "red_command", label: "Red Command (CV)", type: "organization", mentions: 2, description: "Brazil's largest criminal gang. Alliance with TdA for cross-border operations and drug trafficking." },

  // ── Institutions (new) ──
  { id: "imf", label: "IMF", type: "institution", mentions: 5, description: "International Monetary Fund. Board met Jan 2026 to discuss Venezuela. Key anchor for debt restructuring. No Article IV consultation in 217+ months." },
  { id: "world_bank", label: "World Bank", type: "institution", mentions: 3, description: "Board met Jan 2026 on Venezuela. No active loan portfolio. Partner for reconstruction financing alongside IDB." },
  { id: "idb", label: "IDB", type: "institution", mentions: 4, description: "Inter-American Development Bank. Venezuela owes ~$2B. Expected to house reconstruction plan, catalyze private capital, and provide public financing." },
  { id: "wfp", label: "WFP", type: "institution", mentions: 3, description: "World Food Programme. Cut assistance by half in 2025 due to funding shortfall. Rates Venezuela food situation as crisis-level." },
  { id: "unicef", label: "UNICEF", type: "institution", mentions: 3, description: "2025 appeal of $183M remains 84% unfunded ($152.9M gap). Social Protection 97% underfunded. Education/WASH 88% underfunded." },
  { id: "guri_dam", label: "Guri Dam (Simón Bolívar)", type: "institution", mentions: 4, description: "10,000 MW hydroelectric plant producing ~80% of Venezuela's electricity. Output down 40% since 2020. Threatened by drought and mining deforestation." },

  // ── Events (new) ──
  { id: "swiss_asset_freeze", label: "Swiss Asset Freeze", type: "event", mentions: 2, description: "Jan 2026 Switzerland froze assets of Maduro and 35 close associates. Signal for broader international asset recovery." },
  { id: "hydrocarbons_reform", label: "Hydrocarbons Sector Reform", type: "event", mentions: 4, description: "Jan 29 2026 Rodríguez announced broad reform allowing private companies in oil sector. Key to attracting foreign investment." },
  { id: "operation_interciti", label: "Operation Interciti (Spain)", type: "event", mentions: 2, description: "Nov 2025 Spanish police dismantled TdA cell. 13 arrested. Confirmed gang expansion beyond Western Hemisphere into Europe." },
  { id: "tda_alien_enemies_act", label: "Alien Enemies Act Invocation", type: "event", mentions: 3, description: "Mar 2025 White House invoked 1798 Alien Enemies Act claiming TdA 'invaded' the US. 200 detainees deported to El Salvador despite court order." },
  { id: "caracas_blackout_2025", label: "Caracas Blackout (Mar 2025)", type: "event", mentions: 3, description: "Major blackout halted Caracas subway for 48 hours. 2M+ commuters affected. Led to 1x1 public sector work schedule." },
  { id: "wfp_funding_cut", label: "WFP Funding Cut", type: "event", mentions: 2, description: "Aug 2025 WFP announced 50% reduction in Venezuela assistance due to lack of donor funding. Second-least funded HRP globally at 17%." },
  { id: "imf_wb_meetings", label: "IMF/World Bank Venezuela Meetings", type: "event", mentions: 3, description: "Jan 2026 both boards met to discuss Venezuela reconstruction. First formal engagement in years. Precursor to potential program." },

  // ── Macro Indices (new) ──
  { id: "sovereign_debt", label: "Sovereign Debt", type: "macro_index", mentions: 6, description: "$150B+ total external liabilities. Debt-to-GDP ~200%. Bonds in default since 2017. Restructuring requires IMF anchor and creditor coordination." },
  { id: "water_access", label: "Water Access", type: "macro_index", mentions: 4, description: "62% of population faces restricted drinking water access. Linked to electricity blackouts disrupting pumping infrastructure." },
  { id: "diaspora_remittances", label: "Diaspora Remittances", type: "macro_index", mentions: 4, description: "Critical household lifeline. Diaspora contributes $10.6B+ annually to Latin American economies. Strict forex controls limit formal channels." },
  { id: "deforestation_rate", label: "Deforestation Rate", type: "macro_index", mentions: 3, description: "2,821 km² of forest destroyed since Arco Minero creation (2016). 74% in Amazonas and Bolívar. 50% in protected territories." },
  { id: "mercury_contamination", label: "Mercury Contamination", type: "macro_index", mentions: 3, description: "Up to 90% of Indigenous women in Arco Minero have dangerous mercury levels. Contaminated rivers supply drinking water for Colombia and Brazil." },
  { id: "electricity_capacity", label: "Electricity Capacity", type: "macro_index", mentions: 4, description: "Grid transmission losses ~30%. Infrastructure up to 70 years old. $20B estimated to modernize. Hydroelectric output down 40% since 2020." },
  { id: "oil_investment_needed", label: "Oil Investment Gap", type: "macro_index", mentions: 5, description: "$53B needed over 15 years to maintain 1.1M bpd. $183B to restore 3M bpd by 2040. Post-Maduro reform expected to attract cautious FDI." },

  // ── Policies (new) ──
  { id: "arco_minero", label: "Arco Minero (Mining Arc)", type: "policy", mentions: 4, description: "2016 decree designating 12% of Venezuelan territory as special mining zone. Size of Portugal. Covers Amazonas, Bolívar, Delta Amacuro." },
  { id: "clap_distribution", label: "CLAP Food Distribution", type: "policy", mentions: 4, description: "Government food box program. Used as political loyalty tool — distribution conditional on Chavista support. Covers basic goods." },
  { id: "secondary_sanctions_crypto", label: "Crypto Sanctions Evasion", type: "policy", mentions: 3, description: "PDVSA receiving oil payments in USDT stablecoin since 2024. Parallel payment channel outside banking. Part of 'Axis of Evasion' tactics." },
  { id: "us_oil_marketing_deal", label: "US-Venezuela Oil Deal", type: "policy", mentions: 3, description: "Post-capture deal: US markets and sells Venezuelan oil, deposits proceeds in US-controlled accounts for benefit of both peoples. ~$3B in sanctioned oil." },

  // ── Activities (new) ──
  { id: "dark_fleet_shipping", label: "Dark Fleet Shipping", type: "activity", mentions: 5, description: "1,400+ tankers using deceptive practices. 40% of Venezuela's dark fleet sanctioned. At-sea transfers, tracker shutdowns, rebranding as Malaysian crude." },
  { id: "tda_human_trafficking", label: "TdA Human Trafficking", type: "activity", mentions: 3, description: "Tren de Aragua trafficking women from Bolivia to Santiago. Extortion of migrant routes. Sexual exploitation rings in Chile and Peru." },
  { id: "debt_restructuring_process", label: "Debt Restructuring", type: "activity", mentions: 5, description: "Negotiation to resolve $150B+ in external liabilities. Complicated by China's collateralized oil debt and Russia's geopolitical stakes." },
  { id: "return_migration", label: "Return Migration", type: "activity", mentions: 3, description: "Post-Maduro cautious diaspora return. Net migration briefly positive. Host countries tightening policies. Diaspora skeptical of Rodríguez." },

  // ── Features (new) ──
  { id: "brain_drain", label: "Brain Drain", type: "feature", mentions: 5, description: "Massive human capital flight. Doctors, engineers, oil workers emigrated. Critical workforce gaps in health, energy, and education sectors." },
  { id: "infrastructure_decay", label: "Infrastructure Decay", type: "feature", mentions: 5, description: "Decades of underinvestment. Roads, hospitals, power grid, refineries in collapse. Amuay refinery shut down from blackout. $20B+ to restore grid alone." },
  { id: "sanctions_evasion_network", label: "Sanctions Evasion Network", type: "feature", mentions: 4, description: "Integrated system of dark fleet tankers, crypto payments, shell companies, and allied state cooperation (China, Russia, Iran, North Korea)." },
];

// ----------------------------
// Edges — relation: positive | negative | neutral
// ----------------------------
const EDGES = [
  // ── Sanctions → Economy ──
  { source: "us_sanctions", target: "pdvsa", relation: "negative", description: "OFAC sanctions restrict PDVSA operations, financing, and JV partnerships" },
  { source: "us_sanctions", target: "oil_production", relation: "negative", description: "Sanctions choke inputs, maintenance, and export capacity" },
  { source: "us_sanctions", target: "oil_export_revenue", relation: "negative", description: "Sanctions reduce buyer pool and payment channels" },
  { source: "chevron_license_revoked", target: "oil_production", relation: "negative", description: "Revocation of GL41 removed major operational partner" },
  { source: "secondary_oil_tariff", target: "oil_export_revenue", relation: "negative", description: "25% tariff on importers targets China/India purchases" },
  { source: "chevron_license", target: "chevron", relation: "positive", description: "License enables Chevron JV operations in Venezuela" },
  { source: "chevron", target: "oil_production", relation: "positive", description: "Chevron JVs provide technical expertise and maintenance" },

  // ── Economy chain ──
  { source: "oil_production", target: "oil_export_revenue", relation: "positive", description: "Volume × price = revenue" },
  { source: "brent_crude_price", target: "oil_export_revenue", relation: "positive", description: "Brent benchmark directly multiplies per-barrel earnings" },
  { source: "oil_export_revenue", target: "gdp_growth", relation: "positive", description: "Oil exports dominate fiscal revenue and GDP" },
  { source: "gdp_growth", target: "inflation_rate", relation: "negative", description: "Economic contraction drives monetary expansion and supply shortages" },
  { source: "inflation_rate", target: "food_security", relation: "negative", description: "Hyperinflation makes basic nutrition unaffordable" },
  { source: "inflation_rate", target: "poverty_rate", relation: "positive", description: "Inflation erodes purchasing power, expanding poverty" },
  { source: "poverty_rate", target: "mass_migration", relation: "positive", description: "Economic desperation drives emigration" },
  { source: "mass_migration", target: "refugee_count", relation: "positive", description: "Outflows accumulate in host countries" },

  // ── Economy → Stability ──
  { source: "food_security", target: "regime_stability", relation: "positive", description: "CLAP food distribution sustains popular loyalty base" },
  { source: "inflation_rate", target: "regime_stability", relation: "negative", description: "Hyperinflation erodes living standards and regime support" },
  { source: "inflation_rate", target: "military_loyalty", relation: "negative", description: "Real wages of military officers collapse under hyperinflation" },
  { source: "poverty_rate", target: "regime_stability", relation: "negative", description: "Mass deprivation generates anti-regime grievance" },

  // ── Military/Security → Stability ──
  { source: "military_loyalty", target: "regime_stability", relation: "positive", description: "Military is core survival pillar — regime collapses without it" },
  { source: "coup_proofing", target: "military_loyalty", relation: "positive", description: "Overlapping structures and criminal rents deter defection" },
  { source: "cuban_intelligence", target: "coup_proofing", relation: "positive", description: "Cuban advisors monitor officer loyalty and suppress plotting" },
  { source: "drug_trafficking", target: "military_loyalty", relation: "positive", description: "Criminal rents bind senior officers to regime survival" },
  { source: "colectivos", target: "regime_stability", relation: "positive", description: "Armed militias enforce territorial control and suppress dissent" },
  { source: "fanb", target: "regime_stability", relation: "positive", description: "Armed forces provide coercive capacity for regime" },

  // ── International → Military ──
  { source: "russia", target: "fanb", relation: "positive", description: "Arms transfers, military advisors, and equipment maintenance" },
  { source: "iran", target: "fanb", relation: "positive", description: "Drones, fast attack boats, and defense technology cooperation" },
  { source: "cuba", target: "cuban_intelligence", relation: "positive", description: "Cuba provides intelligence officers embedded in Venezuelan military" },

  // ── Criminal networks ──
  { source: "cartel_de_los_soles", target: "drug_trafficking", relation: "positive", description: "State narco-network orchestrates cocaine transshipment" },
  { source: "nicolas_maduro", target: "cartel_de_los_soles", relation: "positive", description: "Maduro personally implicated in narco-trafficking per US indictment" },
  { source: "diosdado_cabello", target: "cartel_de_los_soles", relation: "positive", description: "Cabello identified as key figure in military narco network" },
  { source: "tren_de_aragua", target: "drug_trafficking", relation: "positive", description: "Transnational gang runs smuggling, extortion, and trafficking operations" },
  { source: "tren_de_aragua", target: "transnational_repression", relation: "positive", description: "Used by regime to assassinate dissidents abroad (e.g. Lt. Ojeda in Chile)" },
  { source: "diosdado_cabello", target: "tren_de_aragua", relation: "positive", description: "Cabello directed Tren de Aragua operations per Chilean investigation" },
  { source: "eln", target: "drug_trafficking", relation: "positive", description: "Controls trafficking routes along Colombia-Venezuela border" },
  { source: "segunda_marquetalia", target: "drug_trafficking", relation: "positive", description: "FARC dissidents run drug and illegal mining operations in border zone" },
  { source: "eln", target: "segunda_marquetalia", relation: "negative", description: "Territorial war — ELN retook 90% of contested zone in 2025" },
  { source: "illegal_gold_mining", target: "drug_trafficking", relation: "positive", description: "Gold mining revenue funds and overlaps with trafficking networks" },

  // ── Repression ──
  { source: "diosdado_cabello", target: "political_imprisonment", relation: "positive", description: "Interior ministry runs mass detention campaigns" },
  { source: "operation_knock_knock", target: "political_imprisonment", relation: "positive", description: "Systematic door-to-door arrests of opposition activists" },
  { source: "political_imprisonment", target: "political_prisoner_count", relation: "positive", description: "Detentions accumulate in Foro Penal tracking" },
  { source: "colectivos", target: "political_imprisonment", relation: "positive", description: "Militias assist in identifying and detaining dissidents" },

  // ── Election & Opposition ──
  { source: "election_2024", target: "opposition_cohesion", relation: "positive", description: "Landslide victory mobilised and unified opposition" },
  { source: "maria_corina_machado", target: "opposition_cohesion", relation: "positive", description: "Charismatic leadership unified fractured opposition factions" },
  { source: "maria_corina_machado", target: "edmundo_gonzalez", relation: "positive", description: "Machado backed González as substitute candidate after her ban" },
  { source: "edmundo_gonzalez", target: "election_2024", relation: "positive", description: "González was the opposition's presidential candidate" },
  { source: "cne", target: "election_2024", relation: "negative", description: "CNE declared Maduro winner without publishing tallies — electoral fraud" },
  { source: "election_2024", target: "regime_stability", relation: "negative", description: "Disputed election triggered mass protests and international condemnation" },
  { source: "machado_nobel_prize", target: "maria_corina_machado", relation: "positive", description: "Nobel Prize enhanced international legitimacy and profile" },
  { source: "machado_nobel_prize", target: "opposition_cohesion", relation: "positive", description: "Global recognition strengthened opposition morale" },
  { source: "press_freedom", target: "opposition_cohesion", relation: "positive", description: "Media freedom enables opposition coordination" },

  // ── US Escalation Pathway ──
  { source: "donald_trump", target: "us_sanctions", relation: "positive", description: "Trump administration escalated maximum pressure sanctions" },
  { source: "donald_trump", target: "maduro_bounty", relation: "positive", description: "Raised bounty from $15M to $50M" },
  { source: "donald_trump", target: "operation_absolute_resolve", relation: "positive", description: "Ordered the military operation to capture Maduro" },
  { source: "marco_rubio", target: "fto_designation_cartel", relation: "positive", description: "State Dept orchestrated FTO designation strategy" },
  { source: "fto_designation_cartel", target: "operation_absolute_resolve", relation: "positive", description: "FTO designation reclassified Venezuela as national security threat — legal basis for military action" },
  { source: "fto_designation_tda", target: "us_sanctions", relation: "positive", description: "TdA designation enabled Alien Enemies Act and expanded enforcement" },
  { source: "maduro_bounty", target: "operation_absolute_resolve", relation: "positive", description: "Escalating bounty signalled willingness for direct action" },
  { source: "us_southern_command", target: "operation_absolute_resolve", relation: "positive", description: "SOUTHCOM executed the military operation with 150+ aircraft" },
  { source: "us_military_buildup", target: "operation_absolute_resolve", relation: "positive", description: "Aug 2025 Caribbean deployment positioned forces for strike" },
  { source: "maduro_indictment", target: "operation_absolute_resolve", relation: "positive", description: "Narco-terrorism charges provided legal justification for capture" },
  { source: "hugo_carvajal", target: "maduro_indictment", relation: "positive", description: "Former intelligence chief provided key testimony as cooperating witness" },

  // ── Operation Effects ──
  { source: "operation_absolute_resolve", target: "nicolas_maduro", relation: "negative", description: "Maduro captured, removed from power, in US custody" },
  { source: "operation_absolute_resolve", target: "regime_stability", relation: "negative", description: "Destroyed regime despite decade of coup-proofing" },
  { source: "operation_absolute_resolve", target: "rodriguez_sworn_in", relation: "positive", description: "Power vacuum triggered constitutional succession" },
  { source: "operation_absolute_resolve", target: "prisoner_releases_2026", relation: "positive", description: "New leadership began releasing political prisoners" },
  { source: "operation_absolute_resolve", target: "oil_production", relation: "positive", description: "Sanctions easing expected to attract investment (long-term)" },
  { source: "operation_absolute_resolve", target: "brent_crude_price", relation: "negative", description: "Potential Venezuelan production recovery adds supply pressure" },
  { source: "operation_absolute_resolve", target: "mass_migration", relation: "neutral", description: "Uncertain impact — could slow or briefly increase outflows" },

  // ── Post-Maduro Transition ──
  { source: "delcy_rodriguez", target: "rodriguez_sworn_in", relation: "positive", description: "Proclaimed herself acting president under Art. 233" },
  { source: "vladimir_padrino_lopez", target: "rodriguez_sworn_in", relation: "positive", description: "Defense minister endorsed succession" },
  { source: "tsj", target: "rodriguez_sworn_in", relation: "positive", description: "Supreme court approved constitutional succession" },
  { source: "delcy_rodriguez", target: "amnesty_law_2026", relation: "positive", description: "Rodríguez government advancing amnesty legislation" },
  { source: "amnesty_law_2026", target: "political_prisoner_count", relation: "negative", description: "Amnesty reduces prisoner count" },
  { source: "prisoner_releases_2026", target: "political_prisoner_count", relation: "negative", description: "Direct releases reducing total" },
  { source: "maria_corina_machado", target: "rodriguez_sworn_in", relation: "negative", description: "Opposition rejects Rodríguez — claims González is legitimate president" },
  { source: "edmundo_gonzalez", target: "rodriguez_sworn_in", relation: "negative", description: "Competing claim to presidency" },
  { source: "united_states", target: "rodriguez_sworn_in", relation: "positive", description: "US backed Rodríguez as caretaker for stable transition and oil access" },

  // ── Geopolitical Fallout ──
  { source: "operation_absolute_resolve", target: "russia", relation: "negative", description: "Russia lost key ally, arms customer, and $17B in outstanding loans" },
  { source: "operation_absolute_resolve", target: "china", relation: "negative", description: "China's $60B+ investment portfolio and oil access disrupted" },
  { source: "operation_absolute_resolve", target: "cuba", relation: "negative", description: "32 Cuban security personnel killed; lost intelligence foothold" },
  { source: "china", target: "pdvsa", relation: "positive", description: "China purchased ~80% of Venezuelan oil exports" },
  { source: "china", target: "oil_export_revenue", relation: "positive", description: "Primary buyer sustaining Venezuelan oil revenue" },

  // ── Regional Impact ──
  { source: "mass_migration", target: "colombia", relation: "negative", description: "2.8M Venezuelan refugees strain Colombian services" },
  { source: "mass_migration", target: "brazil", relation: "negative", description: "680K refugees concentrated in Roraima state" },
  { source: "catatumbo_offensive", target: "colombia", relation: "negative", description: "78 killed, 50K+ displaced by ELN assault" },
  { source: "eln", target: "colombia", relation: "negative", description: "ELN controls border territory, destabilises Colombia" },
  { source: "opec", target: "brent_crude_price", relation: "positive", description: "OPEC production cuts support crude prices" },

  // ══════════════════════════════════════
  // EXPANSION EDGES — Upstream & Downstream
  // ══════════════════════════════════════

  // ── Sanctions evasion infrastructure ──
  { source: "dark_fleet_shipping", target: "oil_export_revenue", relation: "positive", description: "Shadow tankers circumvent sanctions, maintaining revenue flow to Caracas" },
  { source: "us_sanctions", target: "dark_fleet_shipping", relation: "positive", description: "Tighter sanctions drive more oil through deceptive dark fleet channels" },
  { source: "dark_fleet_shipping", target: "china", relation: "positive", description: "Dark fleet delivers rebranded Venezuelan crude to Chinese refineries" },
  { source: "secondary_sanctions_crypto", target: "oil_export_revenue", relation: "positive", description: "USDT payments bypass banking sanctions, enabling oil revenue collection" },
  { source: "sanctions_evasion_network", target: "dark_fleet_shipping", relation: "positive", description: "Integrated network coordinates tankers, shell companies, and crypto payments" },
  { source: "sanctions_evasion_network", target: "secondary_sanctions_crypto", relation: "positive", description: "Crypto channels are part of broader evasion infrastructure" },
  { source: "iran", target: "sanctions_evasion_network", relation: "positive", description: "Iran shares sanctions evasion tactics as part of 'Axis of Evasion'" },

  // ── Electricity & infrastructure ──
  { source: "guri_dam", target: "electricity_capacity", relation: "positive", description: "Guri produces ~80% of national electricity — single point of failure" },
  { source: "electricity_capacity", target: "oil_production", relation: "positive", description: "Refineries and oil infrastructure depend on reliable power supply" },
  { source: "electricity_capacity", target: "water_access", relation: "positive", description: "Water pumping relies on electricity grid — blackouts cut water supply" },
  { source: "infrastructure_decay", target: "electricity_capacity", relation: "negative", description: "70-year-old transmission lines lose ~30% of generated power" },
  { source: "infrastructure_decay", target: "oil_production", relation: "negative", description: "Decayed refineries and pipelines limit production capacity" },
  { source: "caracas_blackout_2025", target: "electricity_capacity", relation: "negative", description: "48-hour subway shutdown exposed grid fragility to 2M+ commuters" },
  { source: "operation_absolute_resolve", target: "electricity_capacity", relation: "negative", description: "US strikes damaged transmission infrastructure near Caracas" },
  { source: "water_access", target: "food_security", relation: "positive", description: "Water restrictions compound food insecurity and malnutrition" },

  // ── Mining & environment ──
  { source: "arco_minero", target: "illegal_gold_mining", relation: "positive", description: "Mining Arc decree opened 12% of territory to extraction, enabling industrial-scale illegal mining" },
  { source: "illegal_gold_mining", target: "deforestation_rate", relation: "positive", description: "2,821 km² of forest destroyed since 2016. 74% in Amazonas and Bolívar" },
  { source: "illegal_gold_mining", target: "mercury_contamination", relation: "positive", description: "Mercury used in gold extraction contaminates rivers and indigenous communities" },
  { source: "deforestation_rate", target: "guri_dam", relation: "negative", description: "Mining deforestation causes local droughts and excess sediment, threatening hydroelectric output" },
  { source: "mercury_contamination", target: "food_security", relation: "negative", description: "Mercury in waterways contaminates fish — primary protein source for indigenous communities" },
  { source: "eln", target: "illegal_gold_mining", relation: "positive", description: "ELN earns ~60% of revenue from mining operations in Venezuela and Colombia" },
  { source: "fanb", target: "illegal_gold_mining", relation: "positive", description: "Military officers charge criminal groups for mining access and fuel inputs" },

  // ── TdA transnational expansion ──
  { source: "tren_de_aragua", target: "chile", relation: "negative", description: "Pirates of Aragua operate in Santiago and Tarapacá. Lt. Ojeda assassinated Feb 2024." },
  { source: "tren_de_aragua", target: "peru", relation: "negative", description: "Permanent TdA cells established. Extortion, trafficking, and smuggling operations" },
  { source: "tren_de_aragua", target: "tda_human_trafficking", relation: "positive", description: "TdA traffics women and extorts migrant routes across South America" },
  { source: "nino_guerrero", target: "tren_de_aragua", relation: "positive", description: "Founded and leads TdA from Tocorón prison. Orchestrated transnational expansion." },
  { source: "tren_de_aragua", target: "sinaloa_cartel", relation: "positive", description: "Strategic alliance for logistics and distribution in US/Mexico" },
  { source: "tren_de_aragua", target: "red_command", relation: "positive", description: "Alliance with Brazil's CV for cross-border drug operations" },
  { source: "operation_interciti", target: "tren_de_aragua", relation: "negative", description: "Spanish police dismantled European cell. Confirmed expansion beyond Western Hemisphere." },
  { source: "tda_alien_enemies_act", target: "tren_de_aragua", relation: "negative", description: "1798 Act invoked to deport alleged TdA members. 200 sent to El Salvador." },
  { source: "jose_antonio_kast", target: "mass_migration", relation: "negative", description: "Kast's deportation policies target Venezuelan migrants in Chile" },
  { source: "mass_migration", target: "chile", relation: "negative", description: "Venezuelan migrants strain Chilean services. Anti-migrant political backlash." },
  { source: "mass_migration", target: "peru", relation: "negative", description: "1.5M+ Venezuelan refugees in Peru. Immigration enforcement tightening." },
  { source: "mass_migration", target: "ecuador", relation: "negative", description: "Ecuador terminated bilateral visa agreement Sept 2025. Stricter controls." },

  // ── Humanitarian downstream ──
  { source: "clap_distribution", target: "food_security", relation: "positive", description: "CLAP boxes provide basic food to loyalist households" },
  { source: "clap_distribution", target: "regime_stability", relation: "positive", description: "Food distribution conditioned on political loyalty — social control tool" },
  { source: "wfp_funding_cut", target: "food_security", relation: "negative", description: "WFP halved Venezuela assistance. Second-least funded humanitarian plan globally." },
  { source: "wfp", target: "food_security", relation: "positive", description: "WFP rates Venezuela as crisis-level. Provides nutrition and food assistance." },
  { source: "unicef", target: "food_security", relation: "positive", description: "UNICEF nutrition programme treats acute malnutrition. 84% underfunded." },
  { source: "brain_drain", target: "oil_production", relation: "negative", description: "Emigration of engineers and oil workers hollowed out PDVSA's technical capacity" },
  { source: "brain_drain", target: "electricity_capacity", relation: "negative", description: "Loss of skilled technicians degraded grid maintenance and repair capability" },
  { source: "poverty_rate", target: "brain_drain", relation: "positive", description: "Economic collapse drove professionals and middle class to emigrate" },
  { source: "mass_migration", target: "brain_drain", relation: "positive", description: "8M+ exodus includes disproportionate share of educated workers" },
  { source: "mass_migration", target: "diaspora_remittances", relation: "positive", description: "Diaspora sends money home — now a critical economic lifeline for households" },
  { source: "diaspora_remittances", target: "poverty_rate", relation: "negative", description: "Households receiving remittances have significantly lower poverty levels" },

  // ── Oil sector reconstruction ──
  { source: "hydrocarbons_reform", target: "oil_production", relation: "positive", description: "Jan 2026 reform allows private companies in oil sector for first time" },
  { source: "hydrocarbons_reform", target: "oil_investment_needed", relation: "negative", description: "Reform addresses legal barriers but $53-183B investment gap remains" },
  { source: "delcy_rodriguez", target: "hydrocarbons_reform", relation: "positive", description: "Rodríguez announced broad hydrocarbons reform to attract foreign investment" },
  { source: "chris_wright", target: "oil_production", relation: "positive", description: "Energy Secretary leading US strategy for Venezuelan oil recovery" },
  { source: "exxonmobil", target: "oil_investment_needed", relation: "neutral", description: "CEO called Venezuela 'uninvestable'. $984.5M owed. Won't return without democracy." },
  { source: "conocophillips", target: "oil_investment_needed", relation: "neutral", description: "~$10B in claims. Monitoring developments. Not yet committed to re-enter." },
  { source: "repsol", target: "oil_production", relation: "positive", description: "Operating in Venezuela. Applied for US export licenses. JV with ENI." },
  { source: "eni", target: "oil_production", relation: "positive", description: "Cardón IV West operations continuing. Applied for US authorization." },
  { source: "ccrc", target: "oil_production", relation: "positive", description: "China Concord Resources invested $1B. Targeting 60K bpd by end 2026." },
  { source: "chevron", target: "oil_investment_needed", relation: "positive", description: "Best positioned US major. Existing JVs provide technical expertise platform." },
  { source: "donald_trump", target: "us_oil_marketing_deal", relation: "positive", description: "Trump ordered US to market Venezuelan oil. ~$3B in sanctioned oil secured." },
  { source: "us_oil_marketing_deal", target: "oil_export_revenue", relation: "positive", description: "US-controlled oil sales channel revenue to reconstruction" },

  // ── Debt & reconstruction ──
  { source: "sovereign_debt", target: "oil_investment_needed", relation: "negative", description: "Debt-to-GDP ~200% deters foreign investment. No clear repayment path." },
  { source: "imf", target: "debt_restructuring_process", relation: "positive", description: "IMF program anchors restructuring — provides creditor coordination framework" },
  { source: "idb", target: "debt_restructuring_process", relation: "positive", description: "IDB expected to house reconstruction plan and catalyze private capital" },
  { source: "world_bank", target: "debt_restructuring_process", relation: "positive", description: "Reconstruction financing partner. No active portfolio since Venezuela paid off debts in 2007." },
  { source: "scott_bessent", target: "imf_wb_meetings", relation: "positive", description: "Treasury Secretary engaged IMF/WB leadership on reconstruction" },
  { source: "imf_wb_meetings", target: "debt_restructuring_process", relation: "positive", description: "Jan 2026 board meetings signal formal re-engagement after 217+ months" },
  { source: "china", target: "debt_restructuring_process", relation: "negative", description: "China's $10-12B collateralized oil debt gives leverage to delay restructuring" },
  { source: "russia", target: "debt_restructuring_process", relation: "negative", description: "Russia may use $17B in outstanding loans as geopolitical bargaining chip" },
  { source: "debt_restructuring_process", target: "sovereign_debt", relation: "negative", description: "Successful restructuring would reduce debt burden and unlock investment" },
  { source: "debt_restructuring_process", target: "gdp_growth", relation: "positive", description: "Restructuring unlocks IMF financing, stabilizes economy, attracts FDI" },

  // ── Return migration & diaspora ──
  { source: "operation_absolute_resolve", target: "return_migration", relation: "positive", description: "Maduro removal created cautious optimism among diaspora about returning" },
  { source: "return_migration", target: "brain_drain", relation: "negative", description: "Returning professionals could partially reverse human capital losses" },
  { source: "rodriguez_sworn_in", target: "return_migration", relation: "neutral", description: "Diaspora skeptical of Rodríguez — most waiting for clearer democratic transition" },
  { source: "spain", target: "edmundo_gonzalez", relation: "positive", description: "González in exile in Madrid. Spain provides diplomatic platform." },

  // ── Switzerland & international enforcement ──
  { source: "swiss_asset_freeze", target: "nicolas_maduro", relation: "negative", description: "Maduro and 35 associates' assets frozen — limits financial escape routes" },
  { source: "swiss_asset_freeze", target: "sovereign_debt", relation: "positive", description: "Recovered assets could contribute to debt resolution" },
];

// ----------------------------
// Entity type colours
// ----------------------------
const TYPE_COLORS = {
  person: "#ec4899",
  country: "#10b981",
  organization: "#3b82f6",
  event: "#f59e0b",
  macro_index: "#8b5cf6",
  policy: "#f97316",
  activity: "#ef4444",
  institution: "#0ea5e9",
  feature: "#64748b",
};

const TYPE_BG = {
  person: "#3b1a2e",
  country: "#1a2e24",
  organization: "#1a2440",
  event: "#2e2810",
  macro_index: "#251e3a",
  policy: "#2e2010",
  activity: "#2e1a1a",
  institution: "#1a2a3a",
  feature: "#1e2228",
};

const REL_COLORS = { positive: "#22c55e", negative: "#ef4444", neutral: "#94a3b8" };

// ----------------------------
// Helpers
// ----------------------------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function buildAdjacency(edges) {
  const out = new Map();
  const inn = new Map();
  for (const e of edges) {
    if (!out.has(e.source)) out.set(e.source, []);
    if (!inn.has(e.target)) inn.set(e.target, []);
    out.get(e.source).push(e.target);
    inn.get(e.target).push(e.source);
  }
  return { out, inn };
}

function kHopSubgraph({ nodes, edges, centerId, hops, direction }) {
  if (!centerId) return { nodes, edges };
  const nodeSet = new Set([centerId]);
  const { out, inn } = buildAdjacency(edges);
  let frontier = new Set([centerId]);
  for (let i = 0; i < hops; i++) {
    const next = new Set();
    for (const n of frontier) {
      if (direction === "both" || direction === "out")
        for (const t of out.get(n) || []) if (!nodeSet.has(t)) { nodeSet.add(t); next.add(t); }
      if (direction === "both" || direction === "in")
        for (const s of inn.get(n) || []) if (!nodeSet.has(s)) { nodeSet.add(s); next.add(s); }
    }
    frontier = next;
    if (frontier.size === 0) break;
  }
  return {
    nodes: nodes.filter((n) => nodeSet.has(n.id)),
    edges: edges.filter((e) => nodeSet.has(e.source) && nodeSet.has(e.target)),
  };
}

// ----------------------------
// DAG layout
// ----------------------------
function topoSort(nodeIds, edges) {
  const indeg = new Map(nodeIds.map((id) => [id, 0]));
  const out = new Map(nodeIds.map((id) => [id, []]));
  for (const e of edges) {
    if (!indeg.has(e.source) || !indeg.has(e.target)) continue;
    out.get(e.source).push(e.target);
    indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
  }
  const q = [];
  for (const [id, d] of indeg.entries()) if (d === 0) q.push(id);
  q.sort();
  const order = [];
  while (q.length) {
    const id = q.shift();
    order.push(id);
    for (const t of out.get(id) || []) {
      indeg.set(t, indeg.get(t) - 1);
      if (indeg.get(t) === 0) { q.push(t); q.sort(); }
    }
  }
  if (order.length !== nodeIds.length) return order.concat(nodeIds.filter((id) => !order.includes(id)).sort());
  return order;
}

function computeLayers(nodeIds, edges) {
  const order = topoSort(nodeIds, edges);
  const layer = new Map(nodeIds.map((id) => [id, 0]));
  const out = new Map(nodeIds.map((id) => [id, []]));
  for (const e of edges) { if (out.has(e.source) && layer.has(e.target)) out.get(e.source).push(e.target); }
  for (const id of order) {
    const l = layer.get(id) || 0;
    for (const t of out.get(id) || []) if (l + 1 > (layer.get(t) || 0)) layer.set(t, l + 1);
  }
  return layer;
}

function layoutDAG(rfNodes, rfEdges, direction = "LR") {
  const ids = rfNodes.map((n) => n.id);
  const layer = computeLayers(ids, rfEdges);
  const buckets = new Map();
  for (const id of ids) { const l = layer.get(id) || 0; if (!buckets.has(l)) buckets.set(l, []); buckets.get(l).push(id); }
  for (const [, arr] of buckets.entries()) arr.sort();
  const isH = direction === "LR";
  const pos = new Map();
  for (const l of Array.from(buckets.keys()).sort((a, b) => a - b)) {
    const arr = buckets.get(l);
    for (let i = 0; i < arr.length; i++) {
      pos.set(arr[i], { x: isH ? 40 + l * 280 : 40 + i * 260, y: isH ? 40 + i * 90 : 40 + l * 90 });
    }
  }
  return {
    nodes: rfNodes.map((n) => ({ ...n, targetPosition: isH ? "left" : "top", sourcePosition: isH ? "right" : "bottom", position: pos.get(n.id) || { x: 0, y: 0 } })),
    edges: rfEdges,
  };
}

// ----------------------------
// Force layout
// ----------------------------
function runForceLayout(dataNodes, dataEdges, physics, existingPos) {
  if (!dataNodes.length) return {};
  const simNodes = dataNodes.map((n) => ({
    id: n.id, x: existingPos[n.id]?.x ?? (Math.random() - 0.5) * 1200, y: existingPos[n.id]?.y ?? (Math.random() - 0.5) * 800, vx: 0, vy: 0,
  }));
  const idToIdx = new Map(simNodes.map((n, i) => [n.id, i]));
  const simLinks = dataEdges
    .map((e) => ({ source: idToIdx.get(e.source), target: idToIdx.get(e.target), relation: e.relation }))
    .filter((l) => l.source != null && l.target != null);
  const sim = forceSimulation(simNodes)
    .force("charge", forceManyBody().strength(physics.charge))
    .force("link", d3ForceLink(simLinks)
      .distance((l) => {
        const mod = l.relation === "positive" ? -0.15 : l.relation === "negative" ? 0.15 : 0;
        return physics.linkDistance * (1 + mod * physics.linkDistVar);
      })
      .strength(0.5))
    .force("center", forceCenter(0, 0).strength(physics.gravity))
    .stop();
  if (physics.collision) sim.force("collision", forceCollide(70));
  for (let i = 0; i < 300; i++) {
    if (physics.wiggle) for (const n of simNodes) { n.vx += (Math.random() - 0.5) * 2; n.vy += (Math.random() - 0.5) * 2; }
    sim.tick();
  }
  const pos = {};
  for (const n of simNodes) pos[n.id] = { x: n.x, y: n.y };
  return pos;
}

// ----------------------------
// ReactFlow builders
// ----------------------------
const nodeMap = Object.fromEntries(NODES.map((n) => [n.id, n]));

function makeRfNodes(nodes, nodeVis) {
  return nodes.map((n) => {
    const mentionScale = (n.mentions || 1) / 10;
    const boost = nodeVis.sizeByStrength ? Math.max(0.7, Math.min(1.5, 0.7 + mentionScale * 0.8)) : 1;
    const scale = nodeVis.size * boost;
    const bg = nodeVis.useTypeFill ? (TYPE_BG[n.type] || "#ffffff") : nodeVis.fill;
    const accent = TYPE_COLORS[n.type] || "#666";
    return {
      id: n.id,
      data: {
        label: (
          <div className="leading-tight" style={{ color: nodeVis.labelColor }}>
            <div className="font-semibold text-xs">{n.label}</div>
            {nodeVis.showLabels && (
              <>
                <div className="text-[10px] opacity-60 mt-0.5">{n.type} · mentions: {n.mentions}</div>
                <div className="mt-1">
                  <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: accent + "20", color: accent, border: `1px solid ${accent}40` }}>
                    {n.type.replace("_", " ")}
                  </span>
                </div>
              </>
            )}
          </div>
        ),
      },
      style: {
        borderRadius: 14, padding: 8,
        border: `${nodeVis.strokeWidth}px solid ${nodeVis.useTypeFill ? accent + "50" : nodeVis.stroke}`,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        background: bg, width: Math.round(200 * scale),
        fontFamily: "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial",
      },
      position: { x: 0, y: 0 },
    };
  });
}

function makeRfEdges(edges, linkVis) {
  return edges.map((e, idx) => {
    const srcM = nodeMap[e.source]?.mentions || 1;
    const tgtM = nodeMap[e.target]?.mentions || 1;
    const mFactor = Math.sqrt((srcM + tgtM) / 2) / 3;
    const sw = Math.max(0.5, linkVis.width * (1 + linkVis.widthVariation * mFactor));
    const stroke = linkVis.useWeightColor ? (REL_COLORS[e.relation] || "#94a3b8") : linkVis.color;
    return {
      id: `e-${e.source}-${e.target}-${idx}`,
      source: e.source, target: e.target, animated: false,
      style: { stroke, strokeWidth: sw, opacity: linkVis.alpha },
      data: { ...e },
    };
  });
}

// ----------------------------
// UI atoms
// ----------------------------
function Card({ title, children }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="mb-3 text-sm font-semibold text-white/90">{title}</div>
      <div className="text-sm text-white/70">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-white/60">
        <span>{label}</span><span className="tabular-nums font-mono">{value}</span>
      </div>
      <input className="w-full accent-blue-500" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-white/70">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-blue-500" />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-xs text-white/70">
      <div className="mb-1">{label}</div>
      <select className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => <option key={opt.value} value={opt.value} className="bg-neutral-800 text-white">{opt.label}</option>)}
      </select>
    </label>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between text-xs text-white/70 gap-2">
      <span>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-white/40">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 28, height: 22, padding: 0, border: "1px solid rgba(255,255,255,0.2)", borderRadius: 4, cursor: "pointer" }} />
      </div>
    </label>
  );
}

// ----------------------------
// Component
// ----------------------------
export default function App() {
  const [showPositive, setShowPositive] = useState(true);
  const [showNegative, setShowNegative] = useState(true);
  const [showNeutral, setShowNeutral] = useState(true);
  const [minMentions, setMinMentions] = useState(1);
  const [centerId, setCenterId] = useState("operation_absolute_resolve");
  const [hops, setHops] = useState(2);
  const [hopDirection, setHopDirection] = useState("both");
  const [layoutMode, setLayoutMode] = useState("LR");
  const [query, setQuery] = useState("");
  const [selectedNode, setSelectedNode] = useState(null);
  const [selectedEdge, setSelectedEdge] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);

  const [physics, setPhysics] = useState({ charge: -200, gravity: 0.08, linkDistance: 250, linkDistVar: 0.3, collision: true, wiggle: false, freeze: false });
  const [nodeVis, setNodeVis] = useState({ size: 1.0, fill: "#1e1e2e", stroke: "#444444", strokeWidth: 1, labelColor: "#e2e2e2", showLabels: true, sizeByStrength: true, useTypeFill: true });
  const [linkVis, setLinkVis] = useState({ color: "#6b7280", width: 1.0, alpha: 0.65, widthVariation: 0.6, useWeightColor: true });

  const forcePosRef = useRef({});

  const filtered = useMemo(() => {
    const edges0 = EDGES.filter((e) => {
      if (e.relation === "positive" && !showPositive) return false;
      if (e.relation === "negative" && !showNegative) return false;
      if (e.relation === "neutral" && !showNeutral) return false;
      return true;
    });
    const validNodes = NODES.filter((n) => n.mentions >= minMentions);
    const validIds = new Set(validNodes.map((n) => n.id));
    const edges1 = edges0.filter((e) => validIds.has(e.source) && validIds.has(e.target));
    const { nodes: n2, edges: e2 } = kHopSubgraph({ nodes: validNodes, edges: edges1, centerId, hops, direction: hopDirection });
    const q = query.trim().toLowerCase();
    if (!q) return { nodes: n2, edges: e2 };
    const keep = new Set(n2.filter((n) => `${n.id} ${n.label} ${n.type} ${n.description}`.toLowerCase().includes(q)).map((n) => n.id));
    const e3 = e2.filter((e) => keep.has(e.source) || keep.has(e.target));
    const keep2 = new Set();
    e3.forEach((e) => { keep2.add(e.source); keep2.add(e.target); });
    return { nodes: n2.filter((n) => keep2.has(n.id)), edges: e3 };
  }, [showPositive, showNegative, showNeutral, minMentions, centerId, hops, hopDirection, query]);

  const forcePositions = useMemo(() => {
    if (layoutMode !== "force" || physics.freeze) return forcePosRef.current;
    const pos = runForceLayout(filtered.nodes, filtered.edges, physics, forcePosRef.current);
    forcePosRef.current = pos;
    return pos;
  }, [filtered, layoutMode, physics]);

  const rfBase = useMemo(() => {
    const rfNodes = makeRfNodes(filtered.nodes, nodeVis);
    const rfEdges = makeRfEdges(filtered.edges, linkVis);
    if (layoutMode === "force") {
      return {
        nodes: rfNodes.map((n) => ({ ...n, position: forcePositions[n.id] || { x: Math.random() * 600, y: Math.random() * 400 }, targetPosition: "left", sourcePosition: "right" })),
        edges: rfEdges,
      };
    }
    return layoutDAG(rfNodes, rfEdges, layoutMode);
  }, [filtered, layoutMode, nodeVis, linkVis, forcePositions]);

  const [nodes, setNodes, onNodesChange] = useNodesState(rfBase.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfBase.edges);
  useEffect(() => { setNodes(rfBase.nodes); setEdges(rfBase.edges); }, [rfBase.nodes, rfBase.edges]);

  const onNodeClick = useCallback((_, node) => {
    setSelectedEdge(null);
    setSelectedNode(NODES.find((n) => n.id === node.id) || null);
    setCenterId(node.id);
  }, []);

  const onEdgeClick = useCallback((_, edge) => { setSelectedNode(null); setSelectedEdge(edge.data || null); }, []);

  const stats = useMemo(() => ({
    n: filtered.nodes.length, e: filtered.edges.length,
    pos: filtered.edges.filter((x) => x.relation === "positive").length,
    neg: filtered.edges.filter((x) => x.relation === "negative").length,
    neu: filtered.edges.filter((x) => x.relation === "neutral").length,
  }), [filtered]);

  const centerOptions = useMemo(() =>
    [...NODES].sort((a, b) => b.mentions - a.mentions).map((n) => ({ value: n.id, label: `${n.label} (${n.type})` })),
  []);

  const pSet = (k) => (v) => setPhysics((p) => ({ ...p, [k]: v }));
  const nSet = (k) => (v) => setNodeVis((o) => ({ ...o, [k]: v }));
  const lSet = (k) => (v) => setLinkVis((o) => ({ ...o, [k]: v }));

  return (
    <div className="h-screen w-full bg-[#0a0a0f]">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }} style={{ background: "#0a0a0f" }}>
        <Background color="#ffffff10" gap={20} />
        <Controls position="bottom-right" className="dark-controls" />

        {/* ── Floating header bar ── */}
        <Panel position="top-center">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#141420]/90 px-4 py-2 shadow-lg backdrop-blur-xl">
            <span className="text-sm font-semibold whitespace-nowrap text-white/90">Shinri — Venezuela KG</span>
            <div className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 tabular-nums text-white/70">Nodes <b className="text-white/90">{stats.n}</b></span>
              <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 tabular-nums text-white/70">Edges <b className="text-white/90">{stats.e}</b></span>
              <span className="rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-green-400">+{stats.pos}</span>
              <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-red-400">−{stats.neg}</span>
              {stats.neu > 0 && <span className="rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-white/50">·{stats.neu}</span>}
            </div>
          </div>
        </Panel>

        {/* ── Floating left panel toggle ── */}
        <Panel position="top-left">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-white/10 bg-[#141420]/90 shadow-lg backdrop-blur-xl text-sm text-white/80 hover:bg-[#1a1a2e] transition-colors"
              title={panelOpen ? "Collapse panel" : "Open panel"}
            >
              {panelOpen ? "✕" : "☰"}
            </button>

            {/* ── Controls panel ── */}
            {panelOpen && (
              <div className="w-[280px] max-h-[calc(100vh-120px)] overflow-y-auto space-y-2 rounded-2xl border border-white/10 bg-[#141420]/90 p-3 shadow-xl backdrop-blur-xl">

                <Card title="Explore">
                  <div className="space-y-3">
                    <Select label="Center node" value={centerId} onChange={setCenterId} options={centerOptions} />
                    <Select label="Hop direction" value={hopDirection} onChange={setHopDirection} options={[
                      { value: "both", label: "Both (in + out)" }, { value: "in", label: "Upstream (causes)" }, { value: "out", label: "Downstream (effects)" },
                    ]} />
                    <Slider label="Max hops" value={hops} min={1} max={5} step={1} onChange={setHops} />
                    <Select label="Layout" value={layoutMode} onChange={setLayoutMode} options={[
                      { value: "LR", label: "DAG Left → Right" }, { value: "TB", label: "DAG Top → Bottom" }, { value: "force", label: "⚛ Force (physics)" },
                    ]} />
                  </div>
                </Card>

                {layoutMode === "force" && (
                  <Card title="⚛ Physics">
                    <div className="space-y-3">
                      <Slider label="Charge" value={physics.charge} min={-500} max={-10} step={10} onChange={pSet("charge")} />
                      <Slider label="Gravity" value={physics.gravity} min={0} max={0.5} step={0.01} onChange={pSet("gravity")} />
                      <Slider label="Link distance" value={physics.linkDistance} min={50} max={500} step={10} onChange={pSet("linkDistance")} />
                      <Slider label="Link dist. variation" value={physics.linkDistVar} min={0} max={1} step={0.05} onChange={pSet("linkDistVar")} />
                      <Toggle label="Collision" checked={physics.collision} onChange={pSet("collision")} />
                      <Toggle label="Wiggle" checked={physics.wiggle} onChange={pSet("wiggle")} />
                      <Toggle label="Freeze layout" checked={physics.freeze} onChange={pSet("freeze")} />
                    </div>
                  </Card>
                )}

                <Card title="Nodes">
                  <div className="space-y-3">
                    <Toggle label="Type-based fill" checked={nodeVis.useTypeFill} onChange={nSet("useTypeFill")} />
                    {!nodeVis.useTypeFill && <ColorInput label="Fill" value={nodeVis.fill} onChange={nSet("fill")} />}
                    {nodeVis.useTypeFill && (
                      <div className="flex flex-wrap gap-x-2 gap-y-1.5 pt-0.5">
                        {Object.entries(TYPE_COLORS).map(([type, color]) => (
                          <span key={type} className="flex items-center gap-1 text-[10px] text-white/50">
                            <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                            {type.replace("_", " ")}
                          </span>
                        ))}
                      </div>
                    )}
                    <ColorInput label="Stroke" value={nodeVis.stroke} onChange={nSet("stroke")} />
                    <ColorInput label="Label color" value={nodeVis.labelColor} onChange={nSet("labelColor")} />
                    <Slider label="Size" value={nodeVis.size} min={0.5} max={2.0} step={0.05} onChange={nSet("size")} />
                    <Slider label="Stroke width" value={nodeVis.strokeWidth} min={0} max={4} step={0.25} onChange={nSet("strokeWidth")} />
                    <Toggle label="Display labels" checked={nodeVis.showLabels} onChange={nSet("showLabels")} />
                    <Toggle label="Size by mentions" checked={nodeVis.sizeByStrength} onChange={nSet("sizeByStrength")} />
                  </div>
                </Card>

                <Card title="Links">
                  <div className="space-y-3">
                    <Toggle label="Relation coloring" checked={linkVis.useWeightColor} onChange={lSet("useWeightColor")} />
                    {linkVis.useWeightColor ? (
                      <div className="flex gap-3 text-[11px] text-white/50">
                        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 rounded" style={{ background: "#22c55e" }} /> positive</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 rounded" style={{ background: "#ef4444" }} /> negative</span>
                        <span className="flex items-center gap-1"><span className="inline-block w-5 h-0.5 rounded" style={{ background: "#94a3b8" }} /> neutral</span>
                      </div>
                    ) : <ColorInput label="Color" value={linkVis.color} onChange={lSet("color")} />}
                    <Slider label="Width" value={linkVis.width} min={0.25} max={3} step={0.25} onChange={lSet("width")} />
                    <Slider label="Alpha" value={linkVis.alpha} min={0} max={1} step={0.05} onChange={lSet("alpha")} />
                    <Slider label="Width variation" value={linkVis.widthVariation} min={0} max={1} step={0.05} onChange={lSet("widthVariation")} />
                  </div>
                </Card>

                <Card title="Thresholding">
                  <div className="space-y-3">
                    <Slider label="Min mentions" value={minMentions} min={1} max={10} step={1} onChange={setMinMentions} />
                    <Toggle label="Show positive edges" checked={showPositive} onChange={setShowPositive} />
                    <Toggle label="Show negative edges" checked={showNegative} onChange={setShowNegative} />
                    <Toggle label="Show neutral edges" checked={showNeutral} onChange={setShowNeutral} />
                    <div className="pt-1">
                      <div className="mb-1 text-xs text-white/60">Search</div>
                      <input className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/90 placeholder-white/30" placeholder="e.g., oil, machado, sanctions" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </div>
                  </div>
                </Card>
              </div>
            )}
          </div>
        </Panel>

        {/* ── Floating right panel: Selection (only when active) ── */}
        <Panel position="top-right">
          <div className="flex flex-col gap-2 items-end">
            {/* Center badge */}
            <div className="rounded-2xl border border-white/10 bg-[#141420]/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
              <div className="font-semibold text-white/90">Center</div>
              <div className="text-white/60">{nodeMap[centerId]?.label || centerId}</div>
            </div>

            {/* Selection card */}
            {(selectedNode || selectedEdge) && (
              <div className="w-[280px] rounded-2xl border border-white/10 bg-[#141420]/90 p-4 shadow-xl backdrop-blur-xl">
                <div className="mb-3 text-sm font-semibold text-white/90">Selection</div>
                {selectedNode && (
                  <div className="space-y-2 text-sm text-white/80">
                    <div className="text-sm font-semibold text-white">{selectedNode.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: (TYPE_COLORS[selectedNode.type] || "#666") + "30", color: TYPE_COLORS[selectedNode.type] || "#999" }}>
                        {selectedNode.type.replace("_", " ")}
                      </span>
                      <span className="text-xs text-white/40">mentions: {selectedNode.mentions}</span>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 leading-relaxed">{selectedNode.description}</div>
                    <div className="flex gap-2">
                      <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 shadow-sm hover:bg-white/10 transition-colors" onClick={() => setCenterId(selectedNode.id)}>Focus here</button>
                      <button className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70 shadow-sm hover:bg-white/10 transition-colors" onClick={() => setQuery(selectedNode.label)}>Search this</button>
                    </div>
                  </div>
                )}
                {selectedEdge && (
                  <div className="space-y-2 text-sm text-white/80">
                    <div className="text-sm font-semibold text-white">{nodeMap[selectedEdge.source]?.label || selectedEdge.source} → {nodeMap[selectedEdge.target]?.label || selectedEdge.target}</div>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: (REL_COLORS[selectedEdge.relation] || "#666") + "30", color: REL_COLORS[selectedEdge.relation] || "#999" }}>
                      {selectedEdge.relation}
                    </span>
                    <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60 leading-relaxed">{selectedEdge.description}</div>
                  </div>
                )}
              </div>
            )}
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
}
