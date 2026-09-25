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

  function selectedQualityKey() {
    const select = $('#chartParameter');
    const entered = QUALITY.filter(item => currentQuality()[item.key] !== null);
    if (select && select.value) return select.value;
    return entered[0]?.key || QUALITY[0].key;
  }

  function syncChartParameterOptions() {
    const wrap = $('#chartParameterWrap'), select = $('#chartParameter');
    if (!wrap || !select) return;
    const key = selectedQualityKey();
    select.innerHTML = '<option value="density">Density — kg/m³ @ 15°C</option><option value="viscosity">Kinematic viscosity — mm²/s @ 40°C</option><option value="methanol">Methanol content — mass %</option><option value="acid">Acid value — mg KOH/g</option><option value="freeGlycerol">Free glycerol — mass %</option><option value="totalGlycerol">Total glycerol — mass %</option><option value="fame">Ester / FAME content — mass %</option><option value="water">Water / moisture — mg/kg</option><option value="flash">Flash point — °C</option>';
    select.value = key;
    wrap.style.display = $('#chartDataset').value === 'singleQuality' ? '' : 'none';
  }

  function syncChartTypeOptions() {
    const dataset = $('#chartDataset').value, type = $('#chartType');
    const allowed = { singleQuality:['bar'], qualityProfile:['bar','radar'], fameViscosity:['scatter','line','bar'], fameGlycerol:['scatter','line','bar'], conditionsYield:['line','scatter','bar'], ratioYield:['line','scatter','bar'] }[dataset] || ['bar'];
    [...type.options].forEach(option => option.disabled = !allowed.includes(option.value));
    if (!allowed.includes(type.value)) type.value = allowed[0];
    syncChartParameterOptions();
  }

  function chartMeta() {
    const selection = $('#chartDataset').value, values = currentQuality();
    if (selection === 'singleQuality') {
      const item = QUALITY.find(entry => entry.key === selectedQualityKey()) || QUALITY[0], value = values[item.key];
      return { kind:'single', title:item.name + ': measured value vs specification', subtitle:value === null ? 'Enter the experimental ' + item.name.toLowerCase() + ' value in the quality table to plot the real measurement.' : 'Raw ' + item.unit + ' values are plotted directly — no cross-unit normalization.', tag:value === null ? 'NO DATA' : 'USER DATA', item, value, note:value === null ? 'This graph is waiting for an experimental measurement.' : 'Real user measurement: ' + describeNumber(value) + ' ' + item.unit + '. Reference and specification limits use the same unit.' };
    }
    if (selection === 'qualityProfile') {
      const items = QUALITY.filter(item => values[item.key] !== null).map(item => ({ label:item.name, exp:statusFor(item, values[item.key]).score, ref:100, exact:describeNumber(values[item.key]) + ' ' + item.unit + '; reference ' + describeNumber(item.ref) + '; specification ' + item.spec }));
      return { kind:'category', title:'Biodiesel quality compliance profile', subtitle:items.length ? 'Normalized 0–100 compliance view. Raw measurements remain visible in the quality table.' : 'Enter one or more experimental quality measurements to create the profile.', items, tag:items.length ? 'USER DATA' : 'NO DATA', note:'Only this cross-parameter view is normalized because the underlying properties use different physical units.' };
    }
    if (selection === 'fameViscosity') return singlePair('FAME content vs kinematic viscosity','FAME content (mass %)','Kinematic viscosity (mm²/s @ 40°C)',values.fame,values.viscosity,'FAME','Viscosity');
    if (selection === 'fameGlycerol') return singlePair('FAME content vs total glycerol','FAME content (mass %)','Total glycerol (mass %)',values.fame,values.totalGlycerol,'FAME','Total glycerol');
    if (selection === 'conditionsYield') return runSeries('Reaction temperature vs estimated FAME yield','Reaction temperature (°C)',state.history.map(run => ({x:run.temperature,y:run.yield,label:'Run ' + run.run + ': ' + fmt(run.temperature,1) + ' °C → ' + fmt(run.yield,1) + '% estimated yield'})));
    return runSeries('Alcohol-to-oil ratio vs estimated FAME yield','Alcohol-to-oil molar ratio',state.history.map(run => ({x:run.ratio,y:run.yield,label:'Run ' + run.run + ': ' + fmt(run.ratio,2) + ':1 → ' + fmt(run.yield,1) + '% estimated yield'})));
  }

  function singlePair(title,xLabel,yLabel,x,y,xName,yName) {
    const points = x !== null && y !== null ? [{x,y,label:xName + ': ' + describeNumber(x) + '; ' + yName + ': ' + describeNumber(y)}] : [];
    return {kind:'xy',title,subtitle:points.length ? 'One real user-entered analytical pair. With one point, regression is intentionally not calculated.' : 'Enter both ' + xName.toLowerCase() + ' and ' + yName.toLowerCase() + ' measurements to plot this relationship.',xLabel,yLabel,points,tag:points.length ? 'USER DATA' : 'NO DATA',note:'The x and y axes use the original measurement units. No normalization is applied.'};
  }

  function runSeries(title,xLabel,points) {
    return {kind:'xy',title,subtitle:points.length ? points.length + ' user-triggered model run' + (points.length === 1 ? '' : 's') + ' in this browser. These points are model estimates, not experimental observations.' : 'Run the simulation with different conditions to add model-run points to this graph.',xLabel,yLabel:'Estimated FAME yield (%)',points,tag:points.length ? 'MODEL RUNS' : 'NO DATA',note:'Every point comes from a simulation run entered by the user. Regression is descriptive only and is not experimental validation.'};
  }

  function svgEl(name,attrs={},text='') { const el=document.createElementNS('http://www.w3.org/2000/svg',name); Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,value)); if(text) el.textContent=text; return el; }
  function makeSvg(label='Analytical chart') { return svgEl('svg',{viewBox:'0 0 920 390',role:'img','aria-label':label,preserveAspectRatio:'xMidYMid meet'}); }
  function drawEmpty(message) { $('#chartArea').innerHTML='<div class="chart-empty"><div><b>No chartable data yet</b>'+message+'</div></div>'; }
  function niceStep(range,target=6) { const raw=Math.abs(range)/Math.max(target,1); if(!Number.isFinite(raw)||raw===0)return 1; const power=10**Math.floor(Math.log10(raw)), normalized=raw/power, factor=normalized<=1?1:normalized<=2?2:normalized<=5?5:10; return factor*power; }
  function niceTicks(min,max,target=6) { if(!Number.isFinite(min)||!Number.isFinite(max))return []; if(min===max){const pad=Math.abs(min)||1;min-=pad*.5;max+=pad*.5;} const step=niceStep(max-min,target),start=Math.floor(min/step)*step,end=Math.ceil(max/step)*step,ticks=[]; for(let value=start;value<=end+step*.001;value+=step)ticks.push(Number(value.toPrecision(12))); return ticks; }
  function axisFormat(value,span) { const abs=Math.abs(value); if(abs>=1000)return value.toLocaleString(undefined,{maximumFractionDigits:0}); if(span<.01)return value.toFixed(4); if(span<.1)return value.toFixed(3); if(span<1)return value.toFixed(2); if(span<10)return value.toFixed(2); if(span<100)return value.toFixed(1); return value.toFixed(0); }
  function drawGrid(svg,{left=76,top=28,right=28,bottom=62,yMin=0,yMax=100,yLabel='Value'}={}) { const width=920-left-right,height=390-top-bottom,ticks=niceTicks(yMin,yMax,6),actualMin=ticks[0]??yMin,actualMax=ticks[ticks.length-1]??yMax,span=actualMax-actualMin||1; ticks.forEach(value=>{const y=top+height-((value-actualMin)/span)*height;svg.append(svgEl('line',{x1:left,y1:y,x2:left+width,y2:y,class:'gridline'}));svg.append(svgEl('text',{x:left-10,y:y+4,'text-anchor':'end',class:'axis-text'},axisFormat(value,span)));}); svg.append(svgEl('line',{x1:left,y1:top,x2:left,y2:top+height,class:'axis'}));svg.append(svgEl('line',{x1:left,y1:top+height,x2:left+width,y2:top+height,class:'axis'}));svg.append(svgEl('text',{x:16,y:top+2,class:'axis-text axis-label'},yLabel));return {left,top,width,height,actualMin,actualMax,span}; }
  function addTitle(parent,text){parent.append(svgEl('title',{},text));}

  function drawSingleQualityChart(meta) {
    const item=meta.item,value=meta.value;if(value===null){drawEmpty(meta.subtitle);$('#chartLegend').innerHTML='';return;}
    const targets=[{label:'Measured',value,className:'bar-exp'},{label:'Reference',value:item.ref,className:'bar-ref'}];
    if(item.type==='range'){targets.push({label:'Lower limit',value:item.min,className:'bar-limit'},{label:'Upper limit',value:item.max,className:'bar-limit'});} else if(item.type==='max'){targets.push({label:'Maximum allowed',value:item.max,className:'bar-limit'});} else {targets.push({label:'Minimum required',value:item.min,className:'bar-limit'});}
    const rawValues=targets.map(point=>point.value),rawMin=Math.min(...rawValues),rawMax=Math.max(...rawValues),span=rawMax-rawMin||Math.max(Math.abs(rawMax)*.1,1),yMin=rawMin-span*.18,yMax=rawMax+span*.18,svg=makeSvg(item.name+' measured value compared with specification'),b=drawGrid(svg,{yMin,yMax,yLabel:item.unit}),groupWidth=b.width/targets.length,barWidth=Math.min(90,groupWidth*.52),baseY=b.top+b.height,mapY=valuePoint=>b.top+b.height-((valuePoint-b.actualMin)/b.span)*b.height;
    targets.forEach((point,index)=>{const x=b.left+groupWidth*index+groupWidth/2,y=mapY(point.value),zeroY=mapY(0),barTop=Math.min(y,zeroY),barHeight=Math.max(2,Math.abs(zeroY-y)),rect=svgEl('rect',{x:x-barWidth/2,y:barTop,width:barWidth,height:barHeight,rx:5,class:point.className});addTitle(rect,point.label+': '+describeNumber(point.value)+' '+item.unit);svg.append(rect);svg.append(svgEl('text',{x,y:Math.max(b.top+12,y-9),'text-anchor':'middle',class:'value-label'},describeNumber(point.value)));svg.append(svgEl('text',{x,y:baseY+24,'text-anchor':'middle',class:'axis-text',transform:'rotate(-22 '+x+' '+(baseY+24)+')'},point.label));});
    svg.append(svgEl('text',{x:b.left+b.width/2,y:382,'text-anchor':'middle',class:'axis-text axis-label'},item.name+' — '+item.unit));$('#chartArea').replaceChildren(svg);$('#chartLegend').innerHTML='<span class="legend-exp">Measured value</span><span class="legend-ref">Reference value</span><span class="legend-limit">Specification limit</span>';
  }

  function drawCategoryChart(meta,type) {
    const items=meta.items,svg=makeSvg('Biodiesel quality compliance profile'),b=drawGrid(svg,{yMin:0,yMax:100,yLabel:'Compliance score (0–100)'});
    if(type==='radar'){const cx=460,cy=188,radius=120,count=items.length;[20,40,60,80,100].forEach(score=>{const r=radius*score/100,points=Array.from({length:count},(_,index)=>{const angle=-Math.PI/2+Math.PI*2*index/count;return (cx+Math.cos(angle)*r)+','+(cy+Math.sin(angle)*r);}).join(' ');svg.append(svgEl('polygon',{points,fill:'none',stroke:'rgba(148,225,216,.17)'}));});const pointsFor=key=>items.map((item,index)=>{const angle=-Math.PI/2+Math.PI*2*index/count,r=radius*clamp(item[key],0,100)/100;return (cx+Math.cos(angle)*r)+','+(cy+Math.sin(angle)*r);}).join(' ');items.forEach((item,index)=>{const angle=-Math.PI/2+Math.PI*2*index/count,x=cx+Math.cos(angle)*(radius+25),y=cy+Math.sin(angle)*(radius+25);svg.append(svgEl('line',{x1:cx,y1:cy,x2:cx+Math.cos(angle)*radius,y2:cy+Math.sin(angle)*radius,class:'gridline'}));svg.append(svgEl('text',{x,y:y+4,'text-anchor':x<cx-15?'end':x>cx+15?'start':'middle',class:'axis-text'},truncate(item.label,22)));});const ref=svgEl('polygon',{points:pointsFor('ref'),class:'chart-radar-ref'});addTitle(ref,'Specification target: 100 compliance');svg.append(ref);const exp=svgEl('polygon',{points:pointsFor('exp'),class:'chart-radar'});addTitle(exp,'Experimental compliance profile');svg.append(exp);items.forEach((item,index)=>{const angle=-Math.PI/2+Math.PI*2*index/count,x=cx+Math.cos(angle)*radius*item.exp/100,y=cy+Math.sin(angle)*radius*item.exp/100,dot=svgEl('circle',{cx:x,cy:y,r:4,class:'chart-point'});addTitle(dot,item.label+': '+fmt(item.exp,1)+'/100 — '+item.exact);svg.append(dot);});}
    else {const groupWidth=b.width/items.length,barWidth=Math.min(54,groupWidth*.48);items.forEach((item,index)=>{const x=b.left+groupWidth*index+groupWidth/2,y=b.top+b.height-(item.exp/100)*b.height,rect=svgEl('rect',{x:x-barWidth/2,y,width:barWidth,height:b.top+b.height-y,rx:5,class:'bar-exp'});addTitle(rect,item.label+': '+fmt(item.exp,1)+'/100. '+item.exact);svg.append(rect);svg.append(svgEl('text',{x,y:Math.max(b.top+12,y-8),'text-anchor':'middle',class:'value-label'},fmt(item.exp,0)));svg.append(svgEl('text',{x,y:b.top+b.height+25,'text-anchor':'middle',class:'axis-text',transform:'rotate(-28 '+x+' '+(b.top+b.height+25)+')'},truncate(item.label,19)));});}
    $('#chartArea').replaceChildren(svg);$('#chartLegend').innerHTML='<span class="legend-exp">Experimental compliance</span><span class="legend-ref">100 = specification target</span>';
  }

  function regress(points){if(points.length<2)return null;const meanX=points.reduce((sum,point)=>sum+point.x,0)/points.length,meanY=points.reduce((sum,point)=>sum+point.y,0)/points.length,numerator=points.reduce((sum,point)=>sum+(point.x-meanX)*(point.y-meanY),0),denominator=points.reduce((sum,point)=>sum+(point.x-meanX)**2,0);if(denominator===0)return null;const slope=numerator/denominator,intercept=meanY-slope*meanX,ssTotal=points.reduce((sum,point)=>sum+(point.y-meanY)**2,0),ssResidual=points.reduce((sum,point)=>sum+(point.y-(slope*point.x+intercept))**2,0);return {slope,intercept,r2:ssTotal?1-ssResidual/ssTotal:null};}

  function drawXYChart(meta,type){
    const points=[...meta.points].sort((a,b)=>a.x-b.x),svg=makeSvg(meta.title),xs=points.map(point=>point.x),ys=points.map(point=>point.y);let xMin=Math.min(...xs),xMax=Math.max(...xs),yMin=Math.min(...ys),yMax=Math.max(...ys);
    if(xMin===xMax){const pad=Math.abs(xMin)*.08||1;xMin-=pad;xMax+=pad;}if(yMin===yMax){const pad=Math.abs(yMin)*.08||1;yMin-=pad;yMax+=pad;}
    const xSpan=xMax-xMin,ySpan=yMax-yMin,xPad=xSpan*.14,yPad=ySpan*.16,plotXMin=xMin-xPad,plotXMax=xMax+xPad,plotYMin=Math.max(0,yMin-yPad),plotYMax=yMax+yPad,b=drawGrid(svg,{yMin:plotYMin,yMax:plotYMax,yLabel:meta.yLabel}),mapX=x=>b.left+((x-plotXMin)/(plotXMax-plotXMin))*b.width,mapY=y=>b.top+b.height-((y-b.actualMin)/b.span)*b.height;
    niceTicks(plotXMin,plotXMax,6).forEach(value=>{const x=b.left+((value-plotXMin)/(plotXMax-plotXMin))*b.width;if(x<b.left-1||x>b.left+b.width+1)return;svg.append(svgEl('line',{x1:x,y1:b.top,x2:x,y2:b.top+b.height,class:'gridline vertical-grid'}));svg.append(svgEl('text',{x,y:b.top+b.height+25,'text-anchor':'middle',class:'axis-text'},axisFormat(value,plotXMax-plotXMin)));});
    svg.append(svgEl('text',{x:b.left+b.width/2,y:382,'text-anchor':'middle',class:'axis-text axis-label'},meta.xLabel));
    if(type==='bar'){const barWidth=Math.min(58,b.width/points.length*.55);points.forEach(point=>{const x=mapX(point.x),y=mapY(point.y),zeroY=mapY(Math.max(0,b.actualMin)),rect=svgEl('rect',{x:x-barWidth/2,y:Math.min(y,zeroY),width:barWidth,height:Math.max(2,Math.abs(zeroY-y)),rx:5,class:'bar-exp'});addTitle(rect,point.label);svg.append(rect);svg.append(svgEl('text',{x,y:Math.max(b.top+12,y-8),'text-anchor':'middle',class:'value-label'},fmt(point.y,1)+'%'));});}
    else if(type==='line'){svg.append(svgEl('path',{d:'M '+points.map(point=>mapX(point.x)+' '+mapY(point.y)).join(' L '),class:'chart-line'}));points.forEach(point=>{const dot=svgEl('circle',{cx:mapX(point.x),cy:mapY(point.y),r:5.5,class:'chart-point'});addTitle(dot,point.label);svg.append(dot);});}
    else {points.forEach(point=>{const dot=svgEl('circle',{cx:mapX(point.x),cy:mapY(point.y),r:6,class:'chart-point'});addTitle(dot,point.label);svg.append(dot);});}
    const regression=regress(points);if(regression){const y1=regression.slope*plotXMin+regression.intercept,y2=regression.slope*plotXMax+regression.intercept;svg.append(svgEl('path',{d:'M '+mapX(plotXMin)+' '+mapY(y1)+' L '+mapX(plotXMax)+' '+mapY(y2),class:'chart-trend'}));}
    $('#chartArea').replaceChildren(svg);$('#chartLegend').innerHTML='<span class="legend-run">'+(meta.tag==='MODEL RUNS'?'User-triggered model run':'User measurement')+'</span>'+(regression?'<span class="legend-limit">Least-squares trendline</span>':'');return regression;
  }

  function truncate(value,max){return value.length>max?value.slice(0,max-1)+'…':value;}
  function renderStatistics(meta,regression){let count=0,values=[],mean=null,sd=null;if(meta.kind==='category'){count=meta.items.length;values=meta.items.map(item=>item.exp);}else if(meta.kind==='single'){count=meta.value===null?0:1;values=meta.value===null?[]:[meta.value];}else{count=meta.points.length;values=meta.points.map(point=>point.y);}if(values.length){mean=values.reduce((a,b)=>a+b,0)/values.length;sd=values.length>1?Math.sqrt(values.reduce((sum,value)=>sum+(value-mean)**2,0)/(values.length-1)):null;}const unit=meta.kind==='single'?' '+meta.item.unit:meta.kind==='xy'?' '+meta.yLabel:' compliance points';$('#statistics').innerHTML='<div><dt>Data points</dt><dd>'+count+'</dd></div><div><dt>Mean</dt><dd>'+(mean===null?'—':fmt(mean,mean<1?3:2)+unit)+'</dd></div><div><dt>Std. deviation</dt><dd>'+(sd===null?'—':fmt(sd,sd<1?3:2)+unit)+'</dd></div><div><dt>Regression</dt><dd>'+(regression?'y = '+fmt(regression.slope,3)+'x '+(regression.intercept>=0?'+':'−')+' '+fmt(Math.abs(regression.intercept),2):'—')+'</dd></div><div><dt>R²</dt><dd>'+(regression&&regression.r2!==null?fmt(regression.r2,3):'—')+'</dd></div>';$('#statsNote').textContent=meta.note;}
  function renderChart(){syncChartTypeOptions();const meta=chartMeta(),type=$('#chartType').value;$('#chartTitle').textContent=meta.title;$('#chartSubhead').textContent=meta.subtitle;$('#chartDataTag').textContent=meta.tag;$('#chartDataTag').className='tag '+(meta.tag==='NO DATA'?'calculated':meta.tag==='MODEL RUNS'?'estimated':'user');if((meta.kind==='category'&&!meta.items.length)||(meta.kind==='xy'&&!meta.points.length)||(meta.kind==='single'&&meta.value===null)){drawEmpty(meta.subtitle);renderStatistics(meta,null);$('#chartLegend').innerHTML='';return;}let regression=null;if(meta.kind==='single')drawSingleQualityChart(meta);else if(meta.kind==='category')drawCategoryChart(meta,type);else regression=drawXYChart(meta,type);renderStatistics(meta,regression);}
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


  const AUTH_KEYS = { account: 'bdlab_local_account_v1', session: 'bdlab_local_session_v1' };

  async function hashCredential(value) {
    const data = new TextEncoder().encode(value);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  }

  function getLocalAccount() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEYS.account) || 'null'); } catch { return null; }
  }

  function getSession() {
    try { return JSON.parse(sessionStorage.getItem(AUTH_KEYS.session) || 'null'); } catch { return null; }
  }

  function setAuthMessage(message) { $('#authMessage').textContent = message; }

  function showAuthenticatedState(session) {
    $('#authOverlay').classList.add('hidden');
    $('#authOverlay').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('auth-locked');
    let sessionBox = $('.user-session');
    if (!sessionBox) {
      sessionBox = document.createElement('div');
      sessionBox.className = 'user-session';
      $('.header-status').after(sessionBox);
    }
    sessionBox.innerHTML = '<small>Signed in as ' + session.email.replace(/[<>&"]/g, '') + '</small><button class="logout-button" type="button">Log out</button>';
    $('.logout-button').addEventListener('click', () => {
      sessionStorage.removeItem(AUTH_KEYS.session);
      location.reload();
    });
  }

  function showAuthState() {
    const session = getSession();
    const account = getLocalAccount();
    if (session && account && session.email === account.email) {
      showAuthenticatedState(session);
    } else {
      $('#authOverlay').classList.remove('hidden');
      document.body.classList.add('auth-locked');
    }
  }

  function bindAuth() {
    const form = $('#authForm');
    const toggle = $('#authModeToggle');
    let signupMode = false;
    toggle.addEventListener('click', () => {
      signupMode = !signupMode;
      $('#authTitle').textContent = signupMode ? 'Create BD•LAB account' : 'Sign in to BD•LAB';
      $('#authSubtitle').textContent = signupMode ? 'Your account stays on this browser and is not sent to a server.' : 'Sign in to your local project workspace.';
      $('#authSubmitLabel').textContent = signupMode ? 'CREATE ACCOUNT' : 'SIGN IN';
      toggle.textContent = signupMode ? 'I already have an account' : 'Create a new account';
      setAuthMessage('');
    });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const email = $('#authEmail').value.trim().toLowerCase();
      const password = $('#authPassword').value;
      if (!email || password.length < 6) return setAuthMessage('Use a valid email and a password with at least 6 characters.');
      const hash = await hashCredential(password);
      if (signupMode) {
        const existing = getLocalAccount();
        if (existing && existing.email !== email) return setAuthMessage('A different local account already exists in this browser.');
        localStorage.setItem(AUTH_KEYS.account, JSON.stringify({ email, passwordHash: hash, createdAt: new Date().toISOString() }));
        sessionStorage.setItem(AUTH_KEYS.session, JSON.stringify({ email, signedInAt: new Date().toISOString() }));
        showAuthenticatedState({ email });
        return;
      }
      const account = getLocalAccount();
      if (!account || account.email !== email || account.passwordHash !== hash) return setAuthMessage('Incorrect email or password for this browser.');
      sessionStorage.setItem(AUTH_KEYS.session, JSON.stringify({ email, signedInAt: new Date().toISOString() }));
      showAuthenticatedState({ email });
    });
    showAuthState();
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
    $('#chartType').addEventListener('change', renderChart); $('#chartDataset').addEventListener('change', renderChart); $('#chartParameter').addEventListener('change', renderChart); $('#exportChart').addEventListener('click', exportChartPng);
    $$('.equipment').forEach(button => button.addEventListener('click', () => renderEquipment(button.dataset.equipment)));
    $('#closeEquipment').addEventListener('click', () => { $('#equipmentPanel').classList.remove('open'); $$('.equipment').forEach(button => button.classList.remove('active')); });
    $('#generateReport').addEventListener('click', generateReport); $('#exportCsv').addEventListener('click', exportCsv);
    const observer = new IntersectionObserver(entries => { entries.forEach(entry => { if (entry.isIntersecting) $$('.nav-link').forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${entry.target.id}`)); }); }, { rootMargin: '-35% 0px -55% 0px' });
    $$('#home,#simulation,#process,#quality,#analysis,#diagnostics,#report').forEach(section => observer.observe(section));
  }

  function init() {
    bindAuth();
    bind();
    const c = calculate(inputs()); state.lastCalc = c; setPreview(c); updateValidation(c); renderDiagnostics(c, currentQuality()); renderChart();
  }
  init();
})();
