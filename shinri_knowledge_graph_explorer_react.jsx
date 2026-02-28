import React, { useMemo, useState, useEffect, useCallback, useRef } from "react";
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
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
 * Shinri — Venezuela / Maduro Knowledge Graph
 * Refined from Reuters, AP, NYT, WSJ, FT, BBC, Bloomberg, The Economist,
 * Foreign Policy, CFR, ICG, Atlantic Council, ACLED (2024-2026 coverage).
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
  person: "#fce7f3",
  country: "#d1fae5",
  organization: "#dbeafe",
  event: "#fef3c7",
  macro_index: "#ede9fe",
  policy: "#ffedd5",
  activity: "#fee2e2",
  institution: "#e0f2fe",
  feature: "#f1f5f9",
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
        boxShadow: "0 4px 12px rgba(0,0,0,0.06)",
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
    <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <div className="text-sm text-black/80">{children}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, onChange }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs text-black/70">
        <span>{label}</span><span className="tabular-nums font-mono">{value}</span>
      </div>
      <input className="w-full" type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-black/80">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label className="block text-xs text-black/80">
      <div className="mb-1">{label}</div>
      <select className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
    </label>
  );
}

function ColorInput({ label, value, onChange }) {
  return (
    <label className="flex items-center justify-between text-xs text-black/80 gap-2">
      <span>{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-mono text-[10px] text-black/40">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: 28, height: 22, padding: 0, border: "1px solid rgba(0,0,0,0.2)", borderRadius: 4, cursor: "pointer" }} />
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
  const [nodeVis, setNodeVis] = useState({ size: 1.0, fill: "#ffffff", stroke: "#cccccc", strokeWidth: 1, labelColor: "#1a1a1a", showLabels: true, sizeByStrength: true, useTypeFill: true });
  const [linkVis, setLinkVis] = useState({ color: "#94a3b8", width: 1.0, alpha: 0.55, widthVariation: 0.6, useWeightColor: true });

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
    <div className="h-screen w-full">
      <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onNodeClick={onNodeClick} onEdgeClick={onEdgeClick} fitView fitViewOptions={{ padding: 0.2 }} proOptions={{ hideAttribution: true }}>
        <Background />
        <Controls position="bottom-right" />
        <MiniMap pannable zoomable style={{ bottom: 10, left: 10 }} />

        {/* ── Floating header bar ── */}
        <Panel position="top-center">
          <div className="flex items-center gap-3 rounded-2xl border border-black/10 bg-white/90 px-4 py-2 shadow-lg backdrop-blur-xl">
            <span className="text-sm font-semibold whitespace-nowrap">Shinri — Venezuela KG</span>
            <div className="h-4 w-px bg-black/10" />
            <div className="flex items-center gap-1.5 text-xs">
              <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 tabular-nums">Nodes <b>{stats.n}</b></span>
              <span className="rounded-full border border-black/10 bg-white px-2 py-0.5 tabular-nums">Edges <b>{stats.e}</b></span>
              <span className="rounded-full border border-green-200 bg-green-50 px-2 py-0.5">+{stats.pos}</span>
              <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5">−{stats.neg}</span>
              {stats.neu > 0 && <span className="rounded-full border border-black/10 bg-white px-2 py-0.5">·{stats.neu}</span>}
            </div>
          </div>
        </Panel>

        {/* ── Floating left panel toggle ── */}
        <Panel position="top-left">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setPanelOpen((v) => !v)}
              className="flex items-center justify-center w-9 h-9 rounded-xl border border-black/10 bg-white/90 shadow-lg backdrop-blur-xl text-sm hover:bg-white transition-colors"
              title={panelOpen ? "Collapse panel" : "Open panel"}
            >
              {panelOpen ? "✕" : "☰"}
            </button>

            {/* ── Controls panel ── */}
            {panelOpen && (
              <div className="w-[280px] max-h-[calc(100vh-120px)] overflow-y-auto space-y-2 rounded-2xl border border-black/10 bg-white/90 p-3 shadow-xl backdrop-blur-xl">

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
                          <span key={type} className="flex items-center gap-1 text-[10px] text-black/50">
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
                      <div className="flex gap-3 text-[11px] text-black/50">
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
                      <div className="mb-1 text-xs text-black/70">Search</div>
                      <input className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm" placeholder="e.g., oil, machado, sanctions" value={query} onChange={(e) => setQuery(e.target.value)} />
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
            <div className="rounded-2xl border border-black/10 bg-white/90 px-3 py-2 text-xs shadow-lg backdrop-blur-xl">
              <div className="font-semibold">Center</div>
              <div className="text-black/70">{nodeMap[centerId]?.label || centerId}</div>
            </div>

            {/* Selection card */}
            {(selectedNode || selectedEdge) && (
              <div className="w-[280px] rounded-2xl border border-black/10 bg-white/90 p-4 shadow-xl backdrop-blur-xl">
                <div className="mb-3 text-sm font-semibold">Selection</div>
                {selectedNode && (
                  <div className="space-y-2 text-sm text-black/80">
                    <div className="text-sm font-semibold">{selectedNode.label}</div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: (TYPE_COLORS[selectedNode.type] || "#666") + "20", color: TYPE_COLORS[selectedNode.type] || "#666" }}>
                        {selectedNode.type.replace("_", " ")}
                      </span>
                      <span className="text-xs text-black/50">mentions: {selectedNode.mentions}</span>
                    </div>
                    <div className="rounded-xl border border-black/10 bg-neutral-50/80 p-3 text-xs text-black/70 leading-relaxed">{selectedNode.description}</div>
                    <div className="flex gap-2">
                      <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs shadow-sm hover:bg-neutral-50 transition-colors" onClick={() => setCenterId(selectedNode.id)}>Focus here</button>
                      <button className="rounded-xl border border-black/10 bg-white px-3 py-2 text-xs shadow-sm hover:bg-neutral-50 transition-colors" onClick={() => setQuery(selectedNode.label)}>Search this</button>
                    </div>
                  </div>
                )}
                {selectedEdge && (
                  <div className="space-y-2 text-sm text-black/80">
                    <div className="text-sm font-semibold">{nodeMap[selectedEdge.source]?.label || selectedEdge.source} → {nodeMap[selectedEdge.target]?.label || selectedEdge.target}</div>
                    <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: (REL_COLORS[selectedEdge.relation] || "#666") + "20", color: REL_COLORS[selectedEdge.relation] || "#666" }}>
                      {selectedEdge.relation}
                    </span>
                    <div className="rounded-xl border border-black/10 bg-neutral-50/80 p-3 text-xs text-black/70 leading-relaxed">{selectedEdge.description}</div>
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
