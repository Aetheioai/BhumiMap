import React, { useState } from 'react';
import { Language, TRANSLATIONS } from '../lib/i18n';
import {
  convertAreaFromSqFt,
  formatNumber,
  SQFT_PER_ACRE,
  SQFT_PER_BIGHA,
  SQFT_PER_CHOTAK,
  SQFT_PER_KATHA,
  SQFT_PER_OJUTANGSHO,
  SQFT_PER_SHOTOK,
  SQM_PER_SQFT,
} from '../lib/units';

type AreaUnitKey = 'shotok' | 'katha' | 'bigha' | 'sqFt' | 'acre' | 'sqMeter' | 'chotak' | 'ojutangsho';

interface UnitReferenceViewProps {
  lang: Language;
}

export const UnitReferenceView: React.FC<UnitReferenceViewProps> = ({ lang }) => {
  const t = TRANSLATIONS[lang];
  const [inputVal, setInputVal] = useState<string>('5');
  const [sourceUnit, setSourceUnit] = useState<AreaUnitKey>('katha');

  const numeric = parseFloat(inputVal);
  const safeVal = Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;

  let sqFtValue = 0;
  switch (sourceUnit) {
    case 'shotok':
      sqFtValue = safeVal * SQFT_PER_SHOTOK;
      break;
    case 'katha':
      sqFtValue = safeVal * SQFT_PER_KATHA;
      break;
    case 'bigha':
      sqFtValue = safeVal * SQFT_PER_BIGHA;
      break;
    case 'sqFt':
      sqFtValue = safeVal;
      break;
    case 'acre':
      sqFtValue = safeVal * SQFT_PER_ACRE;
      break;
    case 'sqMeter':
      sqFtValue = safeVal / SQM_PER_SQFT;
      break;
    case 'chotak':
      sqFtValue = safeVal * SQFT_PER_CHOTAK;
      break;
    case 'ojutangsho':
      sqFtValue = safeVal * SQFT_PER_OJUTANGSHO;
      break;
  }

  const converted = convertAreaFromSqFt(sqFtValue);

  const unitOptions: Array<{ key: AreaUnitKey; label: string; value: number; decimals: number }> = [
    { key: 'shotok', label: t.unitShotok, value: converted.shotok, decimals: 4 },
    { key: 'katha', label: t.unitKatha, value: converted.katha, decimals: 4 },
    { key: 'bigha', label: t.unitBigha, value: converted.bigha, decimals: 5 },
    { key: 'sqFt', label: t.unitSqFt, value: converted.sqFt, decimals: 2 },
    { key: 'acre', label: t.unitAcre, value: converted.acre, decimals: 5 },
    { key: 'sqMeter', label: t.unitSqMeter, value: converted.sqMeter, decimals: 2 },
    { key: 'chotak', label: t.unitChotak, value: converted.chotak, decimals: 3 },
    { key: 'ojutangsho', label: t.unitOjutangsho, value: converted.ojutangsho, decimals: 2 },
  ];

  const isBn = lang === 'bn';

  const referenceRows = [
    {
      unit: t.unitShotok,
      eqSqFt: '435.60',
      relation: isBn ? '১/১০০ একর · ১০০ অযুতাংশ' : '1 / 100 Acre · 100 Ojutangsho',
    },
    {
      unit: t.unitKatha,
      eqSqFt: '720.00',
      relation: isBn ? '১.৬৫২৯ শতক · ১৬ ছটাক' : '1.6529 Shotok · 16 Chotak',
    },
    {
      unit: t.unitBigha,
      eqSqFt: '14,400.00',
      relation: isBn ? '২০ কাঠা · ৩৩.০৫৭৯ শতক' : '20 Katha · 33.0579 Shotok',
    },
    {
      unit: t.unitAcre,
      eqSqFt: '43,560.00',
      relation: isBn ? '১০০ শতক · ৬০.৫ কাঠা · ৩.০২৫ বিঘা' : '100 Shotok · 60.5 Katha · 3.025 Bigha',
    },
    {
      unit: t.unitChotak,
      eqSqFt: '45.00',
      relation: isBn ? '১/১৬ কাঠা' : '1 / 16 Katha',
    },
    {
      unit: t.unitOjutangsho,
      eqSqFt: '4.356',
      relation: isBn ? '১/১০০ শতক' : '1 / 100 Shotok',
    },
    {
      unit: isBn ? '১ লিংক (গান্টার শিকল)' : '1 Gunter’s Link (Length)',
      eqSqFt: '0.66 ft',
      relation: isBn ? '১০০ লিংক = ১ চেইন = ৬৬ ফুট' : '100 Links = 1 Chain = 66 ft',
    },
    {
      unit: isBn ? '১ হাত (দৈর্ঘ্য)' : '1 Haat / Cubit (Length)',
      eqSqFt: '1.50 ft',
      relation: isBn ? '১৮ ইঞ্চি' : '18 inches',
    },
  ];

  return (
    <section className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-10 space-y-10">
      <div className="pb-5 border-b border-slate-200">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">
          {t.unitRefTitle}
        </h1>
        <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">{t.unitRefSubtitle}</p>
      </div>

      {/* Instant Standalone Unit Converter */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3.5">{t.quickConverterTitle}</h2>
        <div className="flex flex-col sm:flex-row gap-3 max-w-md mb-5">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            className="flex-1 min-h-[46px] px-3.5 py-2.5 text-base font-mono tabular-nums border border-slate-300 focus:border-teal-800 focus:outline-none bg-white"
            aria-label="Area amount"
          />
          <select
            value={sourceUnit}
            onChange={(e) => setSourceUnit(e.target.value as AreaUnitKey)}
            className="min-h-[46px] px-3.5 py-2.5 text-base sm:text-sm font-medium border border-slate-300 focus:border-teal-800 focus:outline-none bg-white text-slate-900"
            aria-label="Source area unit"
          >
            {unitOptions.map((opt) => (
              <option key={opt.key} value={opt.key}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 border-t border-l border-slate-200">
          {unitOptions.map((opt) => (
            <div
              key={opt.key}
              className={`p-3.5 sm:p-4 border-r border-b border-slate-200 ${
                opt.key === sourceUnit ? 'bg-teal-50/40' : 'bg-white'
              }`}
            >
              <div className="text-xs text-slate-500">{opt.label}</div>
              <div className="mt-1 text-lg sm:text-xl font-mono font-semibold tabular-nums text-slate-900">
                {formatNumber(opt.value, opt.decimals)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Statutory Reference Table */}
      <div>
        <h2 className="text-sm font-semibold text-slate-900 mb-3.5">{t.conversionTableTitle}</h2>
        <div className="overflow-x-auto border-t border-slate-200">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="py-3 font-medium">{isBn ? 'একক' : 'Unit'}</th>
                <th className="py-3 font-medium text-right">
                  {isBn ? 'সমমান (বর্গফুট / ফুট)' : 'Equivalent (sq ft / ft)'}
                </th>
                <th className="py-3 font-medium pl-5">
                  {isBn ? 'সরকারি সম্পর্ক' : 'Statutory Relationship'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {referenceRows.map((row) => (
                <tr key={row.unit}>
                  <td className="py-3 font-medium text-slate-900">{row.unit}</td>
                  <td className="py-3 text-right font-mono tabular-nums text-slate-900 whitespace-nowrap">
                    {row.eqSqFt}
                  </td>
                  <td className="py-3 pl-5 text-slate-600">{row.relation}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mathematical Method Note */}
      <div className="pt-6 border-t border-slate-200 max-w-3xl">
        <h2 className="text-sm font-semibold text-slate-900">{t.heronWhyTitle}</h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">{t.heronWhyBody}</p>
      </div>
    </section>
  );
};
