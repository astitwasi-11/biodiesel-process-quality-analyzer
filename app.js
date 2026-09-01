/* BD•LAB — transparent, client-side educational screening model */
(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const number = (value) => Number.parseFloat(value) || 0;
  const fixed = (value, digits = 1) => Number(value).toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
  const fmt = (value, digits = 1) => Number.isFinite(value) ? fixed(value, digits) : '—';

  const DEFAULTS = {
    oilType: 'Used cooking oil', oilVolume: 350, oilDensity: 910, ffa: 1, moisture: 0.1, oilTemperature: 25,
    alcoholType: 'methanol', alcoholVolume: 70, alcoholPurity: 99, catalystType: 'NaOH', catalystMass: 3.5,
    catalystConcentration: 100, reactionTemperature: 58, reactionTime: 60, stirringSpeed: 650, settlingTime: 8, washingCycles: 3
  };

  const QUALITY = [
    { key: 'density', name: 'Density', unit: 'kg/m³ @ 15°C', ref: 880, type: 'range', min: 860, max: 900, spec: '860–900', method: 'EN ISO 3675 / EN 14214' },
    { key: 'viscosity', name: 'Kinematic viscosity', unit: 'mm²/s @ 40°C', ref: 4.2, type: 'range', min: 3.5, max: 5.0, spec: '3.5–5.0', method: 'EN ISO 3104 / EN 14214' },
    { key: 'methanol', name: 'Methanol content', unit: 'mass %', ref: 0.05, type: 'max', max: 0.20, spec: '≤ 0.20', method: 'EN 14110 / EN 14214' },
    { key: 'acid', name: 'Acid value', unit: 'mg KOH/g', ref: 0.30, type: 'max', max: 0.50, spec: '≤ 0.50', method: 'EN 14104 / EN 14214' },
    { key: 'freeGlycerol', name: 'Free glycerol', unit: 'mass %', ref: 0.01, type: 'max', max: 0.020, spec: '≤ 0.020', method: 'EN 14105 / EN 14214' },
    { key: 'totalGlycerol', name: 'Total glycerol', unit: 'mass %', ref: 0.12, type: 'max', max: 0.25, spec: '≤ 0.25', method: 'EN 14105 / EN 14214' },
    { key: 'fame', name: 'Ester / FAME content', unit: 'mass %', ref: 98.0, type: 'min', min: 96.5, spec: '≥ 96.5', method: 'EN 14103 / EN 14214' },
    { key: 'water', name: 'Water / moisture', unit: 'mg/kg', ref: 200, type: 'max', max: 500, spec: '≤ 500', method: 'EN ISO 12937 / EN 14214' },
    { key: 'flash', name: 'Flash point', unit: '°C', ref: 150, type: 'min', min: 120, spec: '≥ 120', method: 'ASTM D93 / D6751 screening' }
  ];

  const EQUIPMENT = {
    feed: { name: 'Feed tank', purpose: 'Receives the oil feed and provides a controlled supply to preparation equipment.', parameters: 'Feed mass, density, FFA and moisture', problems: 'Water or food solids can disrupt base-catalyzed processing.', safety: 'Confirm material identity and keep incompatible materials segregated.' },
    filter: { name: 'Filter', purpose: 'Removes suspended solids before heating and reaction.', parameters: 'Filter condition and differential pressure', problems: 'Blocked media can reduce flow; retained water is not removed by simple filtration.', safety: 'Treat recovered solids as contaminated process waste.' },
    heater: { name: 'Preheater', purpose: 'Brings prepared oil to a suitable reaction temperature and can assist dewatering.', parameters: 'Oil temperature and heat transfer', problems: 'Overheating may accelerate degradation or create hazards with nearby volatile materials.', safety: 'Use controlled, compatible heating equipment and an approved SOP.' },
    reactor: { name: 'Stirred reactor', purpose: 'Provides mixing and temperature control for transesterification.', parameters: 'Temperature, residence time, mixing speed and closed-system integrity', problems: 'Poor mixing or incorrect reactant balance can lower conversion.', safety: 'Do not heat flammable alcohol mixtures outside approved laboratory controls.' },
    methoxide: { name: 'Methoxide vessel', purpose: 'Represents preparation of the alcohol–catalyst mixture before metered addition.', parameters: 'Alcohol purity, catalyst amount and solution concentration', problems: 'Water uptake or incorrect catalyst loading can promote soap formation.', safety: 'Methanol is toxic/flammable and strong bases are corrosive; follow institutional handling procedures.' },
    settling: { name: 'Settling tank', purpose: 'Allows FAME-rich and crude-glycerol-rich phases to separate by density.', parameters: 'Settling time, temperature and emulsion behavior', problems: 'Soap and residual water may form stable emulsions that delay separation.', safety: 'Keep vessels compatible, labelled and contained.' },
    washing: { name: 'Wash / dry unit', purpose: 'Conceptually represents purification and removal of residual polar contaminants.', parameters: 'Wash intensity, water quality and drying endpoint', problems: 'Over-washing can create emulsions; inadequate drying can leave water in fuel.', safety: 'Manage wash water and residues through approved waste procedures.' },
    storage: { name: 'FAME storage', purpose: 'Holds the finished biodiesel after a quality release decision.', parameters: 'Water exclusion, cleanliness and measured quality properties', problems: 'Storage contamination can alter water and sediment results.', safety: 'Use compatible, labelled containers in accordance with facility rules.' },
    glycerol: { name: 'Glycerol collection tank', purpose: 'Collects the crude lower phase, which may contain glycerol, excess alcohol, catalyst, soap and water.', parameters: 'Phase mass and composition', problems: 'Do not assume crude phase composition from volume alone.', safety: 'Classify and dispose/recover the phase using approved local procedures.' }
  };

  const state = { hasRun: false, history: [], activeEquipment: null, lastCalc: null, changingInputs: false };

  function inputs() {
    const form = $('#simulationForm');
    return Object.fromEntries([...new FormData(form).entries()].map(([key, value]) => {
      const element = form.elements[key];
      return [key, element && element.tagName === 'SELECT' ? value : number(value)];
    }));
  }

  function alcoholProperties(type) {
    return type === 'ethanol'
      ? { name: 'Ethanol', density: 0.789, mw: 46.07, targetRatio: 6, boiling: 78.4 }
      : { name: 'Methanol', density: 0.792, mw: 32.04, targetRatio: 6, boiling: 64.7 };
  }

  function calculate(i) {
    const alcohol = alcoholProperties(i.alcoholType);
    const oilMass = i.oilVolume * i.oilDensity / 1000;
    const oilMoles = oilMass / 885; // approximate average triglyceride molecular weight
    const alcoholMoles = (i.alcoholVolume * alcohol.density * (i.alcoholPurity / 100)) / alcohol.mw;
    const molarRatio = oilMoles > 0 ? alcoholMoles / oilMoles : 0;
    const ratio = i.oilVolume > 0 ? i.alcoholVolume / i.oilVolume : 0;
    const activeCatalyst = i.catalystMass * (i.catalystConcentration / 100);
    const catalystLoading = oilMass > 0 ? activeCatalyst / oilMass * 100 : 0;
    const requiredAlcohol = oilMoles * alcohol.targetRatio * alcohol.mw / (alcohol.density * Math.max(i.alcoholPurity / 100, 0.01));
    const requiredCatalyst = oilMass * 0.01;
    const theoreticalMass = oilMass * 1.005;
    const theoreticalVolume = theoreticalMass / 0.88;

    // Bounded educational screening factors. These are explicit assumptions, not fitted experimental kinetics.
    const factorAlcohol = clamp(1 - Math.abs(molarRatio - alcohol.targetRatio) * 0.055, 0.70, 1);
    const factorTemperature = clamp(1 - Math.max(0, Math.abs(i.reactionTemperature - 58) - 3) * 0.018, 0.72, 1);
    const factorTime = i.reactionTime < 60 ? clamp(0.70 + i.reactionTime * 0.005, 0.70, 1) : clamp(1 - Math.max(0, i.reactionTime - 120) * 0.001, 0.92, 1);
    const factorMix = i.stirringSpeed < 600 ? clamp(0.75 + i.stirringSpeed / 2400, 0.75, 1) : (i.stirringSpeed > 1600 ? 0.96 : 1);
    const factorCatalyst = clamp(1 - Math.abs(catalystLoading - 1.0) * 0.08, 0.78, 1);
    const factorFfa = clamp(1 - Math.max(0, i.ffa - 0.5) * 0.016, 0.68, 1);
    const factorMoisture = clamp(1 - Math.max(0, i.moisture - 0.05) * 0.80, 0.62, 1);
    const factorPurity = clamp(0.94 + (i.alcoholPurity / 100) * 0.06, 0.90, 1);
    const modelYield = clamp(0.965 * factorAlcohol * factorTemperature * factorTime * factorMix * factorCatalyst * factorFfa * factorMoisture * factorPurity, 0.45, 0.97);
    const estimatedMass = theoreticalMass * modelYield;
    const estimatedVolume = estimatedMass / 0.88;
    const glycerolMass = oilMoles * 92.09;
    const stoichiometricAlcoholVolume = oilMoles * 3 * alcohol.mw / (alcohol.density * Math.max(i.alcoholPurity / 100, 0.01));
    const residualAlcohol = Math.max(0, i.alcoholVolume - stoichiometricAlcoholVolume);
    const alcoholRecovery = residualAlcohol * 0.70;
    const alcoholLoss = residualAlcohol * 0.30;
    const washWater = estimatedVolume * 0.25 * i.washingCycles;
    const soapProxy = oilMass * 0.003 * Math.max(i.ffa, 0.1) * (catalystLoading > 1.25 ? 1.35 : 1);
    return { i, alcohol, oilMass, oilMoles, alcoholMoles, molarRatio, ratio, activeCatalyst, catalystLoading, requiredAlcohol, requiredCatalyst, theoreticalMass, theoreticalVolume, modelYield, estimatedMass, estimatedVolume, glycerolMass, residualAlcohol, alcoholRecovery, alcoholLoss, washWater, soapProxy, factors: { factorAlcohol, factorTemperature, factorTime, factorMix, factorCatalyst, factorFfa, factorMoisture, factorPurity } };
  }

  function validate(c) {
    const { i, alcohol, molarRatio, catalystLoading } = c;
    const messages = [];
    if (molarRatio < 5 || molarRatio > 8) messages.push({ level: molarRatio < 4.2 || molarRatio > 9 ? 'danger' : 'warn', text: `${alcohol.name}-to-oil molar ratio (${fmt(molarRatio, 1)}:1) is outside the usual 5–8:1 screening window.` });
    if (catalystLoading > 1.5) messages.push({ level: catalystLoading > 2 ? 'danger' : 'warn', text: `Catalyst loading (${fmt(catalystLoading, 2)} wt%) may be too high and can increase soap formation.` });
    if (catalystLoading < 0.5) messages.push({ level: 'warn', text: `Catalyst loading (${fmt(catalystLoading, 2)} wt%) is low for this simple base-process screening model.` });
    if (i.ffa >= 2) messages.push({ level: i.ffa >= 5 ? 'danger' : 'warn', text: `FFA (${fmt(i.ffa, 1)}%) may increase soap formation; base catalysis is more sensitive at elevated FFA.` });
    if (i.moisture > 0.10) messages.push({ level: i.moisture > 0.30 ? 'danger' : 'warn', text: `Moisture (${fmt(i.moisture, 2)}%) can consume base catalyst and promote soap.` });
    if (i.reactionTemperature >= alcohol.boiling - 5) messages.push({ level: i.reactionTemperature >= alcohol.boiling ? 'danger' : 'warn', text: `Reaction temperature is approaching ${alcohol.name.toLowerCase()}'s boiling point (${alcohol.boiling}°C).` });
    if (i.reactionTime < 45) messages.push({ level: 'warn', text: 'Short reaction time may reduce conversion; verify with your validated procedure.' });
    if (i.stirringSpeed < 350) messages.push({ level: 'warn', text: 'Low stirring speed may limit mass transfer between the phases.' });
    if (!messages.length) messages.push({ level: 'good', text: 'Inputs sit within this educational model’s basic operating-window checks.' });
    return messages;
  }

  function setPreview(c) {
    $('#volumeRatio').textContent = `1 : ${fmt(c.i.oilVolume / c.i.alcoholVolume, 1)}`;
    $('#molarRatio').textContent = `${fmt(c.molarRatio, 1)} : 1`;
    $('#catalystLoading').textContent = `${fmt(c.catalystLoading, 2)} wt% oil`;
    $('#oilMassOut').textContent = `${fmt(c.oilMass, 1)} g`;
    $('#requiredAlcoholOut').textContent = `${fmt(c.requiredAlcohol, 1)} mL`;
    $('#requiredCatalystOut').textContent = `${fmt(c.requiredCatalyst, 2)} g`;
    $('#estimatedYieldOut').textContent = `${fmt(c.modelYield * 100, 1)} %`;
    $('#estimatedVolumeOut').textContent = `${fmt(c.estimatedVolume, 1)} mL`;
    $('#theoreticalMassOut').textContent = `${fmt(c.theoreticalMass, 1)} g`;
    $('#glycerolOut').textContent = `${fmt(c.glycerolMass, 1)} g`;
    $('#methanolOut').textContent = `${fmt(c.alcoholRecovery, 1)} / ${fmt(c.alcoholLoss, 1)} mL`;
    $('#washWaterOut').textContent = `${fmt(c.washWater, 0)} mL`;
    $('#soapOut').textContent = `${fmt(c.soapProxy, 1)} g proxy`;
    $('#liveOil').textContent = `${fmt(c.i.oilVolume, 0)} mL`;
    $('#liveAlcohol').textContent = `${fmt(c.i.alcoholVolume, 0)} mL`;
    $('#liveCatalyst').textContent = `${fmt(c.i.catalystMass, 1)} g`;
    $('#liveReaction').textContent = `${fmt(c.i.reactionTime, 0)} min`;
    $('#liveSettling').textContent = `${fmt(c.i.settlingTime, 1)} h`;
    updateExperimentalYield(c);
  }

  function updateValidation(c) {
    const checks = validate(c);
    const severity = checks.some(m => m.level === 'danger') ? 'red' : checks.some(m => m.level === 'warn') ? 'yellow' : 'green';
    $('#validationLight').className = `status-light ${severity}`;
    $('#validationHeadline').textContent = severity === 'red' ? 'Review high-risk entries' : severity === 'yellow' ? 'Advisory operating-window flags' : 'Basic checks passed';
    $('#validationList').innerHTML = checks.map(m => `<li class="${m.level === 'good' ? 'good' : m.level === 'danger' ? 'danger' : ''}">${m.level === 'good' ? '✓' : m.level === 'danger' ? '⚠' : '◐'} ${m.text}</li>`).join('');
  }

  function updateExperimentalYield(c) {
    const raw = $('#actualBiodieselVolume').value;
    const actual = raw === '' ? null : number(raw);
    const hasActual = actual !== null && actual >= 0;
    const result = hasActual && c.theoreticalVolume > 0 ? actual / c.theoreticalVolume * 100 : null;
    $('#experimentalYieldOut').textContent = result === null ? '—' : `${fmt(result, 1)}%`;
    $('#yieldRing').style.setProperty('--progress', result === null ? 0 : clamp(result, 0, 100));
    $('#yieldEvidence').textContent = result === null ? 'No measurement' : 'USER MEASUREMENT';
    $('#experimentalYieldFormula').textContent = result === null
      ? `Experimental yield = measured volume / ${fmt(c.theoreticalVolume, 1)} mL theoretical × 100`
      : `${fmt(actual, 1)} mL / ${fmt(c.theoreticalVolume, 1)} mL theoretical × 100 = ${fmt(result, 1)}%`;
    return result;
  }

  function currentQuality() {
    return Object.fromEntries(QUALITY.map(item => {
      const input = $(`[data-quality="${item.key}"]`);
      return [item.key, input && input.value !== '' ? number(input.value) : null];
    }));
  }

  function statusFor(item, value) {
    if (value === null || Number.isNaN(value)) return { label: 'AWAITING DATA', className: 'pending', score: null };
    let pass, score;
    if (item.type === 'max') { pass = value <= item.max; score = clamp(item.max / Math.max(value, 0.000001) * 100, 0, 100); }
    else if (item.type === 'min') { pass = value >= item.min; score = clamp(value / item.min * 100, 0, 100); }
    else { pass = value >= item.min && value <= item.max; const distance = value < item.min ? (item.min - value) / item.min : value > item.max ? (value - item.max) / item.max : 0; score = clamp(100 - distance * 100, 0, 100); }
    return { label: pass ? '✓ IN SPEC' : '⚠ OUT OF SPEC', className: pass ? 'pass' : 'fail', score };
  }

  function renderQualityTable() {
    $('#qualityTableBody').innerHTML = QUALITY.map(item => `
      <tr>
        <td>${item.name}<small>${item.unit}</small></td>
        <td><input data-quality="${item.key}" type="number" step="any" min="0" aria-label="${item.name} experimental measurement" placeholder="Measured" /></td>
        <td>${fmt(item.ref, item.ref < 1 ? 3 : 1)}<small>${item.unit}</small></td>
        <td><span class="limit-type">${item.type.toUpperCase()}</span> ${item.spec}<small>${item.method}</small></td>
        <td class="quality-status pending" data-status="${item.key}">AWAITING DATA</td>
      </tr>`).join('');
    $$('[data-quality]').forEach(input => input.addEventListener('input', refreshQuality));
  }

  function refreshQuality() {
    const values = currentQuality();
    const entered = QUALITY.filter(item => values[item.key] !== null);
    const scores = entered.map(item => statusFor(item, values[item.key]).score);
    QUALITY.forEach(item => {
      const status = statusFor(item, values[item.key]);
      const target = $(`[data-status="${item.key}"]`);
      target.textContent = status.label;
      target.className = `quality-status ${status.className}`;
    });
    const score = scores.length ? scores.reduce((sum, value) => sum + value, 0) / scores.length : null;
    $('#qualityScore').textContent = score === null ? '—' : `${Math.round(score)}`;
    const label = score === null ? 'Awaiting measurements' : score >= 90 ? '🟢 Good — screened in specification' : score >= 70 ? '🟡 Needs improvement' : '🔴 Outside specification';
    $('#qualityScoreLabel').textContent = label;
    $('#qualityCoverage').textContent = entered.length ? `${entered.length} of ${QUALITY.length} quality parameters entered as user measurements. Missing parameters are not scored.` : 'No experimental quality values entered.';
    renderDiagnostics(state.lastCalc || calculate(inputs()), values);
    renderChart();
  }

  function describeNumber(value, digits = 1) { return fmt(value, value < 1 ? Math.max(digits, 3) : digits); }

  function simulate(c) {
    state.hasRun = true;
    state.changingInputs = false;
    state.history.push({ temperature: c.i.reactionTemperature, time: c.i.reactionTime, ratio: c.molarRatio, yield: c.modelYield * 100, run: state.history.length + 1 });
    $('#plantLayout').classList.add('running');
    $('#simBadge').innerHTML = '<span class="pulse-dot"></span> Simulation active';
    const timed = [
      [0, () => { $('#liveBiodiesel').textContent = 'calculating'; $('#liveYield').textContent = 'calculating'; }],
      [650, () => animateTextNumber($('#liveBiodiesel'), c.estimatedVolume, ' mL', 0)],
      [950, () => animateTextNumber($('#liveYield'), c.modelYield * 100, ' %', 1)],
      [1450, () => { $('#simBadge').innerHTML = '<span class="pulse-dot"></span> Model run complete'; $('#plantLayout').classList.remove('running'); }]
    ];
    timed.forEach(([delay, fn]) => window.setTimeout(fn, delay));
    const headline = c.modelYield >= .88 ? 'Model screening suggests a favourable conversion window.' : c.modelYield >= .75 ? 'Model screening indicates a workable run with optimization opportunities.' : 'Model screening flags conditions that may reduce conversion or separation quality.';
    $('#runConclusion').textContent = headline;
    $('#runConclusionText').textContent = `Estimated FAME: ${fmt(c.estimatedVolume, 1)} mL (${fmt(c.modelYield * 100, 1)}% model yield). Confirm observed recovery and all quality properties experimentally.`;
    renderDiagnostics(c, currentQuality());
    renderChart();
    showToast(`Model run ${state.history.length} completed — outputs are estimates.`);
  }

  function animateTextNumber(node, end, suffix, digits) {
    const start = performance.now(), duration = 520;
    function frame(now) {
      const progress = clamp((now - start) / duration, 0, 1);
      node.textContent = `${fmt(end * (1 - Math.pow(1 - progress, 3)), digits)}${suffix}`;
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function renderDiagnostics(c, quality) {
    const risks = [];
    const checks = validate(c);
    const yieldCauses = [];
    if (c.molarRatio < 5 || c.molarRatio > 8) yieldCauses.push('alcohol-to-oil ratio');
    if (c.catalystLoading < .5 || c.catalystLoading > 1.5) yieldCauses.push('catalyst loading');
    if (c.i.reactionTemperature < 52 || c.i.reactionTemperature > 62) yieldCauses.push('reaction temperature');
    if (c.i.reactionTime < 45) yieldCauses.push('reaction time');
    if (c.i.stirringSpeed < 350) yieldCauses.push('mixing');
    if (c.i.ffa >= 2 || c.i.moisture > .1) yieldCauses.push('feedstock condition');
    if (yieldCauses.length || c.modelYield < .86) risks.push({ level: c.modelYield < .75 ? 'danger' : 'warning', icon: '◒', title: 'Potential low yield', text: 'The model identifies conditions associated with lower FAME recovery.', causes: yieldCauses.length ? yieldCauses : ['combined model factors'] });
    if (c.i.ffa >= 2 || c.i.moisture > .1 || c.catalystLoading > 1.5) risks.push({ level: c.i.ffa >= 5 ? 'danger' : 'warning', icon: '◌', title: 'Soap / emulsion risk', text: 'High FFA, moisture or excess base can hinder phase separation.', causes: [c.i.ffa >= 2 ? 'elevated FFA' : null, c.i.moisture > .1 ? 'water contamination' : null, c.catalystLoading > 1.5 ? 'excess catalyst' : null].filter(Boolean) });
    if (quality.viscosity !== null && quality.viscosity > QUALITY.find(x => x.key === 'viscosity').max) risks.push({ level: 'warning', icon: '≋', title: 'High viscosity measurement', text: 'A measured viscosity above the displayed range may be consistent with incomplete conversion or retained triglycerides.', causes: ['incomplete conversion', 'residual glycerides', 'insufficient reaction'] });
    if (quality.totalGlycerol !== null && quality.totalGlycerol > QUALITY.find(x => x.key === 'totalGlycerol').max) risks.push({ level: 'danger', icon: '◒', title: 'High total glycerol measurement', text: 'A measured value over the limit warrants investigation of reaction completion and phase separation.', causes: ['incomplete reaction', 'poor phase separation', 'inadequate purification'] });
    if (quality.methanol !== null && quality.methanol > QUALITY.find(x => x.key === 'methanol').max) risks.push({ level: 'danger', icon: '!', title: 'Residual methanol measurement', text: 'Measured methanol exceeds the displayed limit. Treat this as a safety and quality hold until assessed under laboratory procedures.', causes: ['insufficient alcohol removal', 'incomplete purification'] });
    if (!risks.length) risks.push({ level: 'positive', icon: '✓', title: 'No prominent model flags', text: 'Within the entered information, basic screening checks did not identify a dominant problem. This does not replace analytical verification.', causes: ['complete quality measurements are still required'] });
    $('#diagnosticCards').innerHTML = risks.slice(0, 4).map(risk => `<article class="diagnostic-card ${risk.level}"><span class="diagnostic-icon">${risk.icon}</span><h3>${risk.title}</h3><p>${risk.text}</p><ul>${risk.causes.map(cause => `<li>${cause}</li>`).join('')}</ul></article>`).join('');
  }

  function chartMeta() {
    const selection = $('#chartDataset').value;
    const values = currentQuality();
    if (selection === 'quality' || selection === 'profile') {
      const items = QUALITY.filter(item => values[item.key] !== null).map(item => ({ label: item.name, exp: statusFor(item, values[item.key]).score, ref: 100, limit: 100, exact: `${describeNumber(values[item.key])} ${item.unit}; reference ${describeNumber(item.ref)}; spec ${item.spec}` }));
      return { kind: 'category', title: selection === 'profile' ? 'Biodiesel Quality Profile' : 'Experimental vs reference / specification', subtitle: items.length ? 'Comparison values use parameter-aware 0–100 compliance scoring; exact values remain in the table.' : 'Enter a quality measurement to create a comparison.', items, tag: items.length ? 'USER DATA' : 'NO DATA', note: 'Mixed units are normalized only for cross-parameter visualization. The quality table holds raw values and methods.' };
    }
    if (selection === 'fameViscosity') return singlePair('FAME content vs kinematic viscosity', 'FAME content (mass %)', 'Kinematic viscosity (mm²/s @ 40°C)', values.fame, values.viscosity, 'FAME', 'Viscosity');
    if (selection === 'fameGlycerol') return singlePair('FAME content vs total glycerol', 'FAME content (mass %)', 'Total glycerol (mass %)', values.fame, values.totalGlycerol, 'FAME', 'Total glycerol');
    if (selection === 'conditionsYield') return runSeries('Reaction condition vs biodiesel yield', 'Reaction temperature (°C)', state.history.map(run => ({ x: run.temperature, y: run.yield, label: `Run ${run.run}: ${run.temperature}°C, ${fmt(run.yield, 1)}% estimated yield` })));
    return runSeries('Alcohol-to-oil ratio vs yield', 'Molar alcohol : oil ratio', state.history.map(run => ({ x: run.ratio, y: run.yield, label: `Run ${run.run}: ${fmt(run.ratio, 2)}:1, ${fmt(run.yield, 1)}% estimated yield` })));
  }

  function singlePair(title, xLabel, yLabel, x, y, xName, yName) {
    const points = x !== null && y !== null ? [{ x, y, label: `${xName}: ${describeNumber(x)}; ${yName}: ${describeNumber(y)}` }] : [];
    return { kind: 'xy', title, subtitle: points.length ? 'One user-entered analytical pair. Add distinct run data externally before interpreting a correlation.' : `Enter both ${xName.toLowerCase()} and ${yName.toLowerCase()} measurements to plot this relationship.`, xLabel, yLabel, points, tag: points.length ? 'USER DATA' : 'NO DATA', note: 'Regression requires at least two non-identical data points; one point is shown as a comparison only.' };
  }

  function runSeries(title, xLabel, points) {
    return { kind: 'xy', title, subtitle: points.length ? `${points.length} user-triggered model run${points.length === 1 ? '' : 's'} in this browser. These are model estimates, not experimental observations.` : 'Run the simulation with distinct user-selected conditions to add model-run points.', xLabel, yLabel: 'Estimated FAME yield (%)', points, tag: points.length ? 'MODEL RUNS' : 'NO DATA', note: 'Trend statistics are calculated only from user-triggered model runs. They are not experimental regression results.' };
  }

  function svgEl(name, attrs = {}, text = '') {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value));
    if (text) el.textContent = text;
    return el;
  }

  function makeSvg() {
    const svg = svgEl('svg', { viewBox: '0 0 760 315', role: 'img', 'aria-label': $('#chartTitle').textContent });
    return svg;
  }

  function drawEmpty(message) { $('#chartArea').innerHTML = `<div class="chart-empty"><div><b>No chartable data yet</b>${message}</div></div>`; }

  function drawGrid(svg, { left = 46, top = 18, right = 18, bottom = 38, max = 100, yLabel = 'Value' } = {}) {
    const width = 760 - left - right, height = 315 - top - bottom;
    [0, .25, .5, .75, 1].forEach(fraction => {
      const y = top + height * (1 - fraction);
      svg.append(svgEl('line', { x1: left, y1: y, x2: left + width, y2: y, class: 'gridline' }));
      svg.append(svgEl('text', { x: left - 7, y: y + 3, 'text-anchor': 'end', class: 'axis-text' }, fmt(max * fraction, max < 2 ? 2 : 0)));
    });
    svg.append(svgEl('line', { x1: left, y1: top, x2: left, y2: top + height, class: 'axis' }));
    svg.append(svgEl('line', { x1: left, y1: top + height, x2: left + width, y2: top + height, class: 'axis' }));
    svg.append(svgEl('text', { x: 12, y: 18, class: 'axis-text' }, yLabel));
    return { left, top, width, height, right, bottom };
  }

  function addTitle(parent, text) { parent.append(svgEl('title', {}, text)); }

  function drawCategoryChart(meta, type) {
    const items = meta.items;
    const svg = makeSvg();
    const b = drawGrid(svg, { max: 120, yLabel: 'Compliance score' });
    if (type === 'radar') {
      const cx = 385, cy = 154, radius = 105, count = items.length;
      [25, 50, 75, 100].forEach(score => { const r = radius * score / 100; const points = Array.from({ length: count }, (_, index) => { const angle = -Math.PI / 2 + Math.PI * 2 * index / count; return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`; }).join(' '); svg.append(svgEl('polygon', { points, fill: 'none', stroke: 'rgba(148,225,216,.17)' })); });
      const pointsFor = key => items.map((item, index) => { const angle = -Math.PI / 2 + Math.PI * 2 * index / count; const r = radius * item[key] / 100; return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`; }).join(' ');
      items.forEach((item, index) => { const angle = -Math.PI / 2 + Math.PI * 2 * index / count; const x = cx + Math.cos(angle) * (radius + 23); const y = cy + Math.sin(angle) * (radius + 23); svg.append(svgEl('line', { x1: cx, y1: cy, x2: cx + Math.cos(angle) * radius, y2: cy + Math.sin(angle) * radius, class: 'gridline' })); svg.append(svgEl('text', { x, y: y + 3, 'text-anchor': x < cx - 15 ? 'end' : x > cx + 15 ? 'start' : 'middle', class: 'axis-text' }, truncate(item.label, 15))); });
      const ref = svgEl('polygon', { points: pointsFor('ref'), class: 'chart-radar-ref' }); addTitle(ref, 'Reference / specification target: 100'); svg.append(ref);
      const exp = svgEl('polygon', { points: pointsFor('exp'), class: 'chart-radar' }); addTitle(exp, 'Experimental compliance profile'); svg.append(exp);
    } else if (type === 'line' || type === 'scatter') {
      const margin = b.width / Math.max(items.length, 1);
      const points = items.map((item, index) => ({ x: b.left + margin * (index + .5), y: b.top + b.height * (1 - item.exp / 120), item }));
      if (type === 'line' && points.length > 1) svg.append(svgEl('path', { d: `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`, class: 'chart-line' }));
      points.forEach(point => { const dot = svgEl('circle', { cx: point.x, cy: point.y, r: 5, class: 'chart-point' }); addTitle(dot, `${point.item.label}: ${fmt(point.item.exp, 0)}/100 — ${point.item.exact}`); svg.append(dot); svg.append(svgEl('text', { x: point.x, y: b.top + b.height + 16, 'text-anchor': 'middle', class: 'axis-text' }, truncate(point.item.label, 12))); });
    } else {
      const groupWidth = b.width / items.length;
      const barWidth = Math.min(22, groupWidth / 4.8);
      items.forEach((item, index) => {
        const baseX = b.left + groupWidth * index + groupWidth / 2 - barWidth * 1.7;
        [['exp', 'bar-exp', 'Experimental compliance'], ['ref', 'bar-ref', 'Reference target'], ['limit', 'bar-limit', 'Specification target']].forEach(([key, className, label], seriesIndex) => {
          const value = item[key], height = b.height * value / 120;
          const rect = svgEl('rect', { x: baseX + seriesIndex * (barWidth + 3), y: b.top + b.height - height, width: barWidth, height, class: className, rx: 2 });
          addTitle(rect, `${item.label} — ${label}: ${fmt(value, 0)}/100. ${item.exact}`); svg.append(rect);
        });
        svg.append(svgEl('text', { x: b.left + groupWidth * (index + .5), y: b.top + b.height + 16, 'text-anchor': 'middle', class: 'axis-text' }, truncate(item.label, 11)));
      });
    }
    $('#chartArea').replaceChildren(svg);
    $('#chartLegend').innerHTML = '<span class="legend-exp">Experimental / compliance</span><span class="legend-ref">Reference target</span><span class="legend-limit">Specification target</span>';
  }

  function regress(points) {
    if (points.length < 2) return null;
    const meanX = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const meanY = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    const numerator = points.reduce((sum, point) => sum + (point.x - meanX) * (point.y - meanY), 0);
    const denominator = points.reduce((sum, point) => sum + (point.x - meanX) ** 2, 0);
    if (denominator === 0) return null;
    const slope = numerator / denominator, intercept = meanY - slope * meanX;
    const ssTotal = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0);
    const ssResidual = points.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0);
    return { slope, intercept, r2: ssTotal ? 1 - ssResidual / ssTotal : null };
  }

  function drawXYChart(meta, type) {
    const points = meta.points;
    const svg = makeSvg();
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    const xMin = Math.min(...xs), xMax = Math.max(...xs), yMinRaw = Math.min(...ys), yMaxRaw = Math.max(...ys);
    const xPad = xMin === xMax ? Math.max(1, Math.abs(xMin) * .1) : (xMax - xMin) * .15;
    const yPad = yMinRaw === yMaxRaw ? Math.max(1, Math.abs(yMinRaw) * .1) : (yMaxRaw - yMinRaw) * .18;
    const xlo = xMin - xPad, xhi = xMax + xPad, ylo = Math.max(0, yMinRaw - yPad), yhi = yMaxRaw + yPad;
    const b = drawGrid(svg, { max: yhi, yLabel: meta.yLabel });
    const mapX = x => b.left + ((x - xlo) / (xhi - xlo)) * b.width;
    const mapY = y => b.top + b.height - ((y - ylo) / Math.max(yhi - ylo, .0001)) * b.height;
    [0, .25, .5, .75, 1].forEach(fraction => { const x = b.left + b.width * fraction; svg.append(svgEl('text', { x, y: b.top + b.height + 17, 'text-anchor': 'middle', class: 'axis-text' }, fmt(xlo + (xhi - xlo) * fraction, 2))); });
    svg.append(svgEl('text', { x: b.left + b.width / 2, y: 310, 'text-anchor': 'middle', class: 'axis-text' }, meta.xLabel));
    const sorted = [...points].sort((a, b) => a.x - b.x);
    if (type === 'line' && sorted.length > 1) svg.append(svgEl('path', { d: `M ${sorted.map(point => `${mapX(point.x)} ${mapY(point.y)}`).join(' L ')}`, class: 'chart-line' }));
    if (type === 'bar') {
      const barWidth = Math.min(38, b.width / points.length * .6);
      points.forEach(point => { const y = mapY(point.y), rect = svgEl('rect', { x: mapX(point.x) - barWidth / 2, y, width: barWidth, height: b.top + b.height - y, class: 'bar-exp', rx: 3 }); addTitle(rect, point.label); svg.append(rect); });
    } else if (type === 'radar') {
      // A run-sequence radar is useful when the dependent variable is yield; x values are presented in the tooltip.
      const cx = 385, cy = 153, radius = 104, count = points.length;
      [25, 50, 75, 100].forEach(value => { const r = radius * value / 100; svg.append(svgEl('circle', { cx, cy, r, fill: 'none', stroke: 'rgba(148,225,216,.15)' })); });
      const polygonPoints = points.map((point, index) => { const angle = -Math.PI / 2 + Math.PI * 2 * index / count; const r = radius * clamp(point.y, 0, 100) / 100; return `${cx + Math.cos(angle) * r},${cy + Math.sin(angle) * r}`; }).join(' ');
      points.forEach((point, index) => { const angle = -Math.PI / 2 + Math.PI * 2 * index / count; const x = cx + Math.cos(angle) * (radius + 16), y = cy + Math.sin(angle) * (radius + 16); svg.append(svgEl('line', { x1: cx, y1: cy, x2: cx + Math.cos(angle) * radius, y2: cy + Math.sin(angle) * radius, class: 'gridline' })); svg.append(svgEl('text', { x, y, 'text-anchor': 'middle', class: 'axis-text' }, `Run ${index + 1}`)); });
      const poly = svgEl('polygon', { points: polygonPoints, class: 'chart-radar' }); addTitle(poly, 'Estimated yield profile across user-triggered runs'); svg.append(poly);
    } else {
      points.forEach(point => { const dot = svgEl('circle', { cx: mapX(point.x), cy: mapY(point.y), r: 5.5, class: 'chart-point' }); addTitle(dot, point.label); svg.append(dot); });
    }
    const regression = regress(points);
    if (regression && type !== 'radar') {
      const y1 = regression.slope * xlo + regression.intercept, y2 = regression.slope * xhi + regression.intercept;
      svg.append(svgEl('path', { d: `M ${mapX(xlo)} ${mapY(y1)} L ${mapX(xhi)} ${mapY(y2)}`, class: 'chart-trend' }));
    }
    $('#chartArea').replaceChildren(svg);
    $('#chartLegend').innerHTML = `<span class="legend-run">${meta.tag === 'MODEL RUNS' ? 'User-triggered model run' : 'User measurement'}</span>${regression ? '<span class="legend-limit">Least-squares trendline</span>' : ''}`;
    return regression;
  }

  function truncate(value, max) { return value.length > max ? `${value.slice(0, max - 1)}…` : value; }

  function renderStatistics(meta, regression) {
    let count = 0, values = [], mean = null, sd = null;
    if (meta.kind === 'category') { count = meta.items.length; values = meta.items.map(item => item.exp); }
    else { count = meta.points.length; values = meta.points.map(point => point.y); }
    if (values.length) { mean = values.reduce((a, b) => a + b, 0) / values.length; sd = values.length > 1 ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1)) : null; }
    $('#statistics').innerHTML = `<div><dt>Data points</dt><dd>${count}</dd></div><div><dt>Mean</dt><dd>${mean === null ? '—' : fmt(mean, 2)}</dd></div><div><dt>Std. deviation</dt><dd>${sd === null ? '—' : fmt(sd, 2)}</dd></div><div><dt>Regression</dt><dd>${regression ? `y = ${fmt(regression.slope, 3)}x ${regression.intercept >= 0 ? '+' : '−'} ${fmt(Math.abs(regression.intercept), 2)}` : '—'}</dd></div><div><dt>R²</dt><dd>${regression && regression.r2 !== null ? fmt(regression.r2, 3) : '—'}</dd></div>`;
    $('#statsNote').textContent = meta.note;
  }

  function renderChart() {
    const meta = chartMeta(), type = $('#chartType').value;
    $('#chartTitle').textContent = meta.title;
    $('#chartSubhead').textContent = meta.subtitle;
    $('#chartDataTag').textContent = meta.tag;
    $('#chartDataTag').className = `tag ${meta.tag === 'NO DATA' ? 'calculated' : meta.tag === 'MODEL RUNS' ? 'estimated' : 'user'}`;
    if ((meta.kind === 'category' && !meta.items.length) || (meta.kind === 'xy' && !meta.points.length)) { drawEmpty(meta.subtitle); renderStatistics(meta, null); $('#chartLegend').innerHTML = ''; return; }
    const regression = meta.kind === 'category' ? (drawCategoryChart(meta, type), null) : drawXYChart(meta, type);
    renderStatistics(meta, regression);
  }

  function renderEquipment(id) {
    const item = EQUIPMENT[id];
    if (!item) return;
    state.activeEquipment = id;
    $$('.equipment').forEach(button => button.classList.toggle('active', button.dataset.equipment === id));
    $('#equipmentName').textContent = item.name;
    $('#equipmentPurpose').textContent = item.purpose;
    $('#equipmentDetails').innerHTML = `<div><dt>IMPORTANT PARAMETERS</dt><dd>${item.parameters}</dd></div><div><dt>POSSIBLE PROBLEMS</dt><dd>${item.problems}</dd></div><div><dt>SAFETY CONTEXT</dt><dd>${item.safety}</dd></div>`;
    $('#equipmentPanel').classList.add('open');
  }

  function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.add('show'); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove('show'), 3600); }

  function download(filename, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 500); }

  function exportCsv() {
    const c = state.lastCalc || calculate(inputs()), quality = currentQuality();
    const rows = [['BD•LAB Project Export', 'Value', 'Evidence / unit'], ['Oil type', c.i.oilType, 'User data'], ['Oil volume', c.i.oilVolume, 'mL; user data'], ['Oil density', c.i.oilDensity, 'kg/m³; user data'], ['Alcohol type', c.alcohol.name, 'User data'], ['Alcohol volume', c.i.alcoholVolume, 'mL; user data'], ['Catalyst', c.i.catalystType, 'User data'], ['Estimated FAME yield', fmt(c.modelYield * 100, 1), '%; model estimate'], ['Estimated FAME volume', fmt(c.estimatedVolume, 1), 'mL; model estimate'], ['Theoretical FAME volume', fmt(c.theoreticalVolume, 1), 'mL; calculated']];
    rows.push(['QUALITY MEASUREMENTS', 'Experimental', 'Reference / specification']);
    QUALITY.forEach(item => rows.push([item.name, quality[item.key] === null ? '' : quality[item.key], `${item.ref} reference; ${item.spec}; ${item.method}`]));
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    download('biodiesel-project-export.csv', csv, 'text/csv;charset=utf-8'); showToast('CSV export downloaded.');
  }

  function exportChartPng() {
    const svg = $('#chartArea svg');
    if (!svg) { showToast('Add chartable data before exporting a PNG graph.'); return; }
    const source = new XMLSerializer().serializeToString(svg);
    const image = new Image(), url = URL.createObjectURL(new Blob([source], { type: 'image/svg+xml;charset=utf-8' }));
    image.onload = () => { const canvas = document.createElement('canvas'); canvas.width = 1520; canvas.height = 630; const context = canvas.getContext('2d'); context.fillStyle = '#082024'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(image, 0, 0, canvas.width, canvas.height); URL.revokeObjectURL(url); const link = document.createElement('a'); link.download = 'biodiesel-analysis-graph.png'; link.href = canvas.toDataURL('image/png'); link.click(); showToast('PNG graph downloaded.'); };
    image.onerror = () => { URL.revokeObjectURL(url); showToast('The graph could not be exported.'); };
    image.src = url;
  }

  function generateReport() {
    const c = state.lastCalc || calculate(inputs()), quality = currentQuality(), chart = $('#chartArea svg');
    const tableRows = QUALITY.map(item => { const status = statusFor(item, quality[item.key]); return `<tr><td>${item.name}</td><td>${quality[item.key] === null ? 'Not entered' : describeNumber(quality[item.key])} ${item.unit}</td><td>${describeNumber(item.ref)}; ${item.spec}</td><td>${status.label}</td></tr>`; }).join('');
    const diagnostic = $('#diagnosticCards').textContent.replace(/\s+/g, ' ').trim();
    const graphMarkup = chart ? new XMLSerializer().serializeToString(chart) : '<p>No graphable data were entered.</p>';
    const report = window.open('', '_blank', 'noopener,noreferrer');
    if (!report) { showToast('Allow pop-ups to generate the printable report.'); return; }
    report.document.write(`<!doctype html><html><head><title>BD•LAB Project Report</title><style>body{font-family:Arial,sans-serif;color:#122320;margin:34px;line-height:1.45}h1{font-size:28px;margin:0}h2{font-size:18px;border-bottom:1px solid #b9d6d0;padding-bottom:5px;margin-top:30px}.meta{color:#39776d;font-size:12px}.notice{padding:12px;background:#eef8f5;border-left:3px solid #16a98e;font-size:12px}table{width:100%;border-collapse:collapse;font-size:11px}th,td{padding:8px;border:1px solid #bdcfcb;text-align:left}th{background:#e9f3f0}.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.box{border:1px solid #bdcfcb;padding:11px;font-size:12px}.box b{font-size:16px;display:block;color:#077d69}svg{width:100%;max-height:330px;background:#0b292b} @media print{body{margin:16px}}</style></head><body><h1>BIODIESEL PROCESS &amp; QUALITY ANALYZER</h1><p class="meta">Generated ${new Date().toLocaleString()} · Educational project report</p><div class="notice"><b>Evidence note:</b> Inputs and entered quality values are user data. Values marked model estimate are not experimental results. Confirm the current standard and required analytical method before using this report for a laboratory decision.</div><h2>1. Input quantities &amp; reaction conditions</h2><div class="grid"><div class="box">Oil feed<b>${fmt(c.i.oilVolume, 0)} mL</b>${c.i.oilType}; ${fmt(c.i.oilDensity, 0)} kg/m³</div><div class="box">Alcohol charge<b>${fmt(c.i.alcoholVolume, 0)} mL</b>${c.alcohol.name}, ${fmt(c.i.alcoholPurity, 1)}% purity</div><div class="box">Catalyst<b>${fmt(c.i.catalystMass, 1)} g</b>${c.i.catalystType}; ${fmt(c.catalystLoading, 2)} wt% loading</div><div class="box">Reaction<b>${fmt(c.i.reactionTemperature, 0)} °C</b>${fmt(c.i.reactionTime, 0)} min at ${fmt(c.i.stirringSpeed, 0)} RPM</div><div class="box">Molar ratio<b>${fmt(c.molarRatio, 2)} : 1</b>alcohol : oil</div><div class="box">Separation<b>${fmt(c.i.settlingTime, 1)} h</b>${fmt(c.i.washingCycles, 0)} washing cycle(s)</div></div><h2>2. Process flow &amp; reaction</h2><p>Feedstock preparation → alcohol + catalyst preparation → mixing/heating → transesterification → settling/separation → purification/drying → FAME storage.</p><p><b>Triglyceride + alcohol → fatty-acid alkyl esters + glycerol</b></p><h2>3. Calculated and estimated outputs</h2><div class="grid"><div class="box">Theoretical FAME volume<b>${fmt(c.theoreticalVolume, 1)} mL</b>Calculated under model mass assumption</div><div class="box">Estimated FAME yield<b>${fmt(c.modelYield * 100, 1)}%</b>MODEL ESTIMATE</div><div class="box">Estimated FAME volume<b>${fmt(c.estimatedVolume, 1)} mL</b>MODEL ESTIMATE</div><div class="box">Glycerol equivalent<b>${fmt(c.glycerolMass, 1)} g</b>Stoichiometric basis</div><div class="box">Alcohol recovery / loss<b>${fmt(c.alcoholRecovery, 1)} / ${fmt(c.alcoholLoss, 1)} mL</b>MODEL ESTIMATE</div><div class="box">Washing water<b>${fmt(c.washWater, 0)} mL</b>MODEL ESTIMATE</div></div><h2>4. Experimental quality values, reference and standards</h2><table><thead><tr><th>Parameter</th><th>Experimental / user data</th><th>Reference / specification</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table><h2>5. Analytical graph</h2>${graphMarkup}<h2>6. Process diagnostics</h2><p>${diagnostic}</p><h2>7. Conclusion</h2><p>The current model predicts ${fmt(c.estimatedVolume, 1)} mL FAME at ${fmt(c.modelYield * 100, 1)}% estimated yield. This statement is model-based and is not a measured experimental result. Use entered analytical data and appropriate standard methods for any quality conclusion.</p><script>window.onload=()=>window.print()<\/script></body></html>`);
    report.document.close();
  }

  function bind() {
    renderQualityTable();
    $('#simulationForm').addEventListener('submit', event => { event.preventDefault(); const c = calculate(inputs()); state.lastCalc = c; setPreview(c); updateValidation(c); simulate(c); });
    $('#simulationForm').addEventListener('input', () => { const c = calculate(inputs()); state.lastCalc = c; setPreview(c); updateValidation(c); if (state.hasRun) { state.changingInputs = true; $('#simBadge').innerHTML = '<span class="status-light yellow"></span> Inputs changed — rerun'; } renderDiagnostics(c, currentQuality()); });
    $('#actualBiodieselVolume').addEventListener('input', () => updateExperimentalYield(state.lastCalc || calculate(inputs())));
    $('#resetDemo').addEventListener('click', () => { Object.entries(DEFAULTS).forEach(([key, value]) => { $(`#${key}`).value = value; }); $('#actualBiodieselVolume').value = ''; const c = calculate(inputs()); state.lastCalc = c; state.hasRun = false; setPreview(c); updateValidation(c); renderDiagnostics(c, currentQuality()); $('#liveBiodiesel').textContent = '—'; $('#liveYield').textContent = '—'; $('#simBadge').innerHTML = '<span class="pulse-dot"></span> Awaiting run'; showToast('Demo process inputs restored.'); });
    $('#toggleAssumptions').addEventListener('click', () => { $('#assumptionBox').classList.toggle('hidden'); $('#toggleAssumptions').textContent = $('#assumptionBox').classList.contains('hidden') ? 'Show model basis' : 'Hide model basis'; });
    $('#showScoreMethod').addEventListener('click', () => { $('#scoreMethod').classList.toggle('hidden'); $('#showScoreMethod').innerHTML = $('#scoreMethod').classList.contains('hidden') ? 'How is this score calculated? <span>+</span>' : 'Hide scoring method <span>−</span>'; });
    $('#clearQuality').addEventListener('click', () => { $$('[data-quality]').forEach(input => { input.value = ''; }); refreshQuality(); showToast('Experimental quality measurements cleared.'); });
    $('#chartType').addEventListener('change', renderChart); $('#chartDataset').addEventListener('change', renderChart); $('#exportChart').addEventListener('click', exportChartPng);
    $$('.equipment').forEach(button => button.addEventListener('click', () => renderEquipment(button.dataset.equipment)));
    $('#closeEquipment').addEventListener('click', () => { $('#equipmentPanel').classList.remove('open'); $$('.equipment').forEach(button => button.classList.remove('active')); });
    $('#generateReport').addEventListener('click', generateReport); $('#exportCsv').addEventListener('click', exportCsv);
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) $$('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`)); }); }, { rootMargin: '-35% 0px -55% 0px' });
    $$('#home,#simulation,#process,#quality,#analysis,#diagnostics,#report').forEach(section => observer.observe(section));
  }

  function init() {
    bind();
    const c = calculate(inputs()); state.lastCalc = c; setPreview(c); updateValidation(c); renderDiagnostics(c, currentQuality()); renderChart();
  }
  init();
})();
