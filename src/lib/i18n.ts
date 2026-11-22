export type Language = 'en' | 'bn';

export interface Translations {
  brand: string;
  navCalculator: string;
  navSaved: string;
  navUnits: string;
  shareExport: string;
  printSheet: string;
  inputUnitLabel: string;
  sidesHeading: string;
  sideAB: string;
  sideBC: string;
  sideCD: string;
  sideDA: string;
  dirNorth: string;
  dirEast: string;
  dirSouth: string;
  dirWest: string;
  diagonalHeading: string;
  diagonalAC: string;
  diagonalBD: string;
  shapeConvex: string;
  shapeConcave: string;
  plotDetailsHeading: string;
  plotNameLabel: string;
  plotNamePlaceholder: string;
  mouzaLabel: string;
  mouzaPlaceholder: string;
  dagLabel: string;
  dagPlaceholder: string;
  khatianLabel: string;
  khatianPlaceholder: string;
  savePlot: string;
  savedConfirmation: string;
  resetFields: string;
  presetsLabel: string;
  unitShotok: string;
  unitKatha: string;
  unitBigha: string;
  unitSqFt: string;
  unitAcre: string;
  unitSqMeter: string;
  unitChotak: string;
  unitOjutangsho: string;
  traditionalBreakdown: string;
  perimeter: string;
  derivedDiagonal: string;
  triangulationHeading: string;
  triangleArea: string;
  semiPerimeter: string;
  interiorAngles: string;
  naiveWarningTitle: string;
  naiveWarningBody: string;
  diagramAngles: string;
  diagramTriangles: string;
  diagramGrid: string;
  northBearing: string;
  scaleLabel: string;
  offlinePrivacyNote: string;
  errMissing: string;
  errCannotClose: string;
  errDiagShort: string;
  errDiagLong: string;
  errSelfIntersecting: string;
  validRangeLabel: string;
  useMidpointBtn: string;
  savedEmptyTitle: string;
  savedEmptyDesc: string;
  loadPlot: string;
  deletePlot: string;
  exportJson: string;
  importJson: string;
  savedPlotsTitle: string;
  savedPlotsSubtitle: string;
  unitRefTitle: string;
  unitRefSubtitle: string;
  quickConverterTitle: string;
  conversionTableTitle: string;
  heronWhyTitle: string;
  heronWhyBody: string;
  modalTitle: string;
  modalSubtitle: string;
  actionPrint: string;
  actionPrintDesc: string;
  actionPng: string;
  actionPngDesc: string;
  actionSvg: string;
  actionSvgDesc: string;
  actionNativeShare: string;
  actionNativeShareDesc: string;
  actionCopyText: string;
  actionCopyTextDesc: string;
  copiedToast: string;
  close: string;
  printReportTitle: string;
  printGeneratedLocally: string;
  ftPlaceholder: string;
  inPlaceholder: string;
  jumpToDiagram: string;
  tapEdgeHint: string;
  auto90Corner: string;
  stepSides: string;
  stepDiagonal: string;
  advancedGeometry: string;
  navSavedShort: string;
  navUnitsShort: string;
  navShareShort: string;
}

export const TRANSLATIONS: Record<Language, Translations> = {
  en: {
    brand: 'BhumiMap',
    navCalculator: 'Calculator',
    navSaved: 'Saved Plots',
    navUnits: 'Unit Reference',
    shareExport: 'Share / Export',
    printSheet: 'Print Sheet',
    inputUnitLabel: 'Input Unit',
    sidesHeading: 'Boundary Sides',
    sideAB: 'Side A–B',
    sideBC: 'Side B–C',
    sideCD: 'Side C–D',
    sideDA: 'Side D–A',
    dirNorth: 'North',
    dirEast: 'East',
    dirSouth: 'South',
    dirWest: 'West',
    diagonalHeading: 'Diagonal Measurement',
    diagonalAC: 'Diagonal A–C',
    diagonalBD: 'Diagonal B–D',
    shapeConvex: 'Convex',
    shapeConcave: 'Concave',
    plotDetailsHeading: 'Survey Record (Optional)',
    plotNameLabel: 'Plot Label',
    plotNamePlaceholder: 'e.g., Uttara Sector 11 Plot',
    mouzaLabel: 'Mouza / Area',
    mouzaPlaceholder: 'e.g., Mirpur',
    dagLabel: 'Dag No.',
    dagPlaceholder: 'e.g., 412',
    khatianLabel: 'Khatian No.',
    khatianPlaceholder: 'e.g., 108',
    savePlot: 'Save Locally',
    savedConfirmation: 'Saved on device',
    resetFields: 'Clear',
    presetsLabel: 'Sample Plots',
    unitShotok: 'Shotok',
    unitKatha: 'Katha',
    unitBigha: 'Bigha',
    unitSqFt: 'Square Feet',
    unitAcre: 'Acre',
    unitSqMeter: 'Sq. Meter',
    unitChotak: 'Chotak',
    unitOjutangsho: 'Ojutangsho',
    traditionalBreakdown: 'Traditional Breakdown',
    perimeter: 'Perimeter',
    derivedDiagonal: 'Derived Opposite Diagonal',
    triangulationHeading: 'Heron Triangulation Proof',
    triangleArea: 'Area',
    semiPerimeter: 'Semi-perimeter (s)',
    interiorAngles: 'Interior Angles',
    naiveWarningTitle: 'Why diagonal measurement matters',
    naiveWarningBody: 'The common opposite-sides average estimate gives',
    diagramAngles: 'Angles',
    diagramTriangles: 'Triangulation',
    diagramGrid: 'Grid',
    northBearing: 'North',
    scaleLabel: 'Scale',
    offlinePrivacyNote: 'Runs 100% offline on this device. No measurements leave your browser.',
    errMissing: 'Enter positive lengths for all four boundary sides and one diagonal.',
    errCannotClose: 'These four side lengths cannot form a closed four-sided plot. One side is longer than or equal to the sum of the other three.',
    errDiagShort: 'Diagonal is too short to close',
    errDiagLong: 'Diagonal is too long to close',
    errSelfIntersecting: 'Concave fold causes boundaries to cross. Switch back to Convex mode.',
    validRangeLabel: 'Valid diagonal range',
    useMidpointBtn: 'Set valid midpoint',
    savedEmptyTitle: 'No saved plots yet',
    savedEmptyDesc: 'Save any calculated land plot from the Calculator. Records stay strictly inside your browser local storage.',
    loadPlot: 'Open',
    deletePlot: 'Delete',
    exportJson: 'Export Backup (.json)',
    importJson: 'Import Backup',
    savedPlotsTitle: 'Saved Plots on This Device',
    savedPlotsSubtitle: 'Stored locally in browser storage. Never synced or uploaded to any server.',
    unitRefTitle: 'Bangladeshi Land Measurement Standards',
    unitRefSubtitle: 'Official statutory conversion table used by Bangladesh Land Survey (CS/SA/RS/BS) and Rajuk.',
    quickConverterTitle: 'Instant Unit Converter',
    conversionTableTitle: 'Statutory Area Equivalence Table',
    heronWhyTitle: 'Exact Triangulation vs. Average-Side Approximation',
    heronWhyBody: 'An irregular four-sided plot (quadrilateral) does not have a unique area from its four boundary sides alone—its corners can flex like a hinged frame. Measuring one diagonal rigidly locks the plot into two exact triangles solved by Heron’s formula. The informal method of averaging opposite sides ((AB+CD)/2 × (BC+DA)/2) almost always overestimates irregular land.',
    modalTitle: 'Print & Share Survey Diagram',
    modalSubtitle: 'Generated locally on your device as a crisp vector or high-resolution image.',
    actionPrint: 'Print A4 Survey Sheet',
    actionPrintDesc: 'Clean formal single-page survey printout with diagram and conversion table.',
    actionPng: 'Download PNG Image',
    actionPngDesc: 'High-resolution 1600×1120 image ready for WhatsApp, email, or records.',
    actionSvg: 'Download Vector SVG',
    actionSvgDesc: 'Scalable architectural drawing for CAD or high-DPI printing.',
    actionNativeShare: 'Share via Device',
    actionNativeShareDesc: 'Open system share sheet with diagram image and area summary.',
    actionCopyText: 'Copy Text Summary',
    actionCopyTextDesc: 'Copy exact dimensions and Bangladeshi units for messaging.',
    copiedToast: 'Summary copied to clipboard',
    close: 'Close',
    printReportTitle: 'Land Area Survey Sheet',
    printGeneratedLocally: 'Calculated offline on device · Exact Heron triangulation · Statutory Bangladesh units',
    ftPlaceholder: 'ft',
    inPlaceholder: 'in',
    jumpToDiagram: 'Diagram ↓',
    tapEdgeHint: 'Tap any edge to edit',
    auto90Corner: '90° Corner',
    stepSides: '1. Four Boundary Sides',
    stepDiagonal: '2. One Diagonal',
    advancedGeometry: 'Plot Geometry (Convex / Concave)',
    navSavedShort: 'Saved',
    navUnitsShort: 'Units',
    navShareShort: 'Share',
  },
  bn: {
    brand: 'ভূমিমাপ',
    navCalculator: 'ক্যালকুলেটর',
    navSaved: 'সংরক্ষিত জমি',
    navUnits: 'একক নির্দেশিকা',
    shareExport: 'শেয়ার / প্রিন্ট',
    printSheet: 'প্রিন্ট শিট',
    inputUnitLabel: 'পরিমাপের একক',
    sidesHeading: 'চার পাশের দৈর্ঘ্য',
    sideAB: 'বাহু A–B',
    sideBC: 'বাহু B–C',
    sideCD: 'বাহু C–D',
    sideDA: 'বাহু D–A',
    dirNorth: 'উত্তর',
    dirEast: 'পূর্ব',
    dirSouth: 'দক্ষিণ',
    dirWest: 'পশ্চিম',
    diagonalHeading: 'কর্ণের (কোণাকুণি) দৈর্ঘ্য',
    diagonalAC: 'কর্ণ A–C',
    diagonalBD: 'কর্ণ B–D',
    shapeConvex: 'সাধারণ (উত্তল)',
    shapeConcave: 'ভেতরে বাঁকা',
    plotDetailsHeading: 'জমির পরিচিতি (ঐচ্ছিক)',
    plotNameLabel: 'জমির নাম',
    plotNamePlaceholder: 'যেমন: উত্তরা ১১নং সেক্টর প্লট',
    mouzaLabel: 'মৌজা / এলাকা',
    mouzaPlaceholder: 'যেমন: মিরপুর',
    dagLabel: 'দাগ নং',
    dagPlaceholder: 'যেমন: ৪১২',
    khatianLabel: 'খতিয়ান নং',
    khatianPlaceholder: 'যেমন: ১০৮',
    savePlot: 'ডিভাইসে সংরক্ষণ',
    savedConfirmation: 'সংরক্ষিত হয়েছে',
    resetFields: 'মুছুন',
    presetsLabel: 'নমুনা জমি',
    unitShotok: 'শতক (শতাংশ)',
    unitKatha: 'কাঠা',
    unitBigha: 'বিঘা',
    unitSqFt: 'বর্গফুট',
    unitAcre: 'একর',
    unitSqMeter: 'বর্গমিটার',
    unitChotak: 'ছটাক',
    unitOjutangsho: 'অযুতাংশ',
    traditionalBreakdown: 'প্রচলিত হিসাব',
    perimeter: 'পরিসীমা',
    derivedDiagonal: 'অপর কর্ণের দৈর্ঘ্য',
    triangulationHeading: 'হেরন ত্রিভুজ বিভাজন প্রমাণ',
    triangleArea: 'ক্ষেত্রফল',
    semiPerimeter: 'অর্ধ-পরিসীমা (s)',
    interiorAngles: 'অভ্যন্তরীণ কোণসমূহ',
    naiveWarningTitle: 'কর্ণের মাপ কেন জরুরি',
    naiveWarningBody: 'প্রচলিত গড় পদ্ধতিতে অনুমানকৃত ক্ষেত্রফল',
    diagramAngles: 'কোণ',
    diagramTriangles: 'ত্রিভুজ',
    diagramGrid: 'গ্রিড',
    northBearing: 'উত্তর',
    scaleLabel: 'স্কেল',
    offlinePrivacyNote: 'সম্পূর্ণ অফলাইনে আপনার ডিভাইসে চলে। কোনো তথ্য সার্ভারে পাঠানো হয় না।',
    errMissing: 'চারটি বাহু এবং একটি কর্ণের সঠিক ধনাত্মক দৈর্ঘ্য লিখুন।',
    errCannotClose: 'এই চারটি বাহুর দৈর্ঘ্য দিয়ে কোনো আবদ্ধ চতুর্ভুজ জমি তৈরি সম্ভব নয়।',
    errDiagShort: 'কর্ণের দৈর্ঘ্য অনেক ছোট — ত্রিভুজ গঠন হচ্ছে না:',
    errDiagLong: 'কর্ণের দৈর্ঘ্য অনেক বড় — ত্রিভুজ গঠন হচ্ছে না:',
    errSelfIntersecting: 'ভেতরে বাঁকা অবস্থায় সীমানা একে অপরকে ছেদ করছে। সাধারণ (উত্তল) মোডে ফিরে যান।',
    validRangeLabel: 'সঠিক কর্ণের সীমা',
    useMidpointBtn: 'সঠিক মধ্যমান বসান',
    savedEmptyTitle: 'কোনো জমি সংরক্ষিত নেই',
    savedEmptyDesc: 'ক্যালকুলেটর থেকে যেকোনো হিসাব সংরক্ষণ করুন। সব তথ্য শুধুমাত্র আপনার ব্রাউজারে নিরাপদ থাকবে।',
    loadPlot: 'খুলুন',
    deletePlot: 'মুছুন',
    exportJson: 'ব্যাকআপ ডাউনলোড (.json)',
    importJson: 'ব্যাকআপ লোড',
    savedPlotsTitle: 'এই ডিভাইসে সংরক্ষিত জমির তালিকা',
    savedPlotsSubtitle: 'সম্পূর্ণ লোকাল স্টোরেজে সংরক্ষিত। কোনো সার্ভারে আপলোড হয় না।',
    unitRefTitle: 'বাংলাদেশি জমি পরিমাপের মানদণ্ড',
    unitRefSubtitle: 'বাংলাদেশ ভূমি জরিপ (CS/SA/RS/BS) এবং সরকারি মানদণ্ড অনুযায়ী নির্ভুল রূপান্তর তালিকা।',
    quickConverterTitle: 'তাৎক্ষণিক একক রূপান্তরকারী',
    conversionTableTitle: 'সরকারি ক্ষেত্রফল রূপান্তর সারণি',
    heronWhyTitle: 'নির্ভুল ত্রিভুজ পদ্ধতি বনাম গড় পদ্ধতি',
    heronWhyBody: 'অনিয়মিত চার কোণা জমির কেবল চার পাশের দৈর্ঘ্য দিয়ে সঠিক ক্ষেত্রফল নির্ণয় করা যায় না, কারণ কোণ পরিবর্তনে ক্ষেত্রফল বদলে যায়। একটি কর্ণ মেপে জমিকে দুটি ত্রিভুজে ভাগ করে হেরন সূত্রে হিসাব করলে শতভাগ নির্ভুল ক্ষেত্রফল পাওয়া যায়।',
    modalTitle: 'জরিপ নকশা প্রিন্ট ও শেয়ার',
    modalSubtitle: 'সম্পূর্ণ অফলাইনে আপনার ডিভাইসে তৈরি ভেক্টর ও উচ্চমানের ছবি।',
    actionPrint: 'A4 জরিপ শিট প্রিন্ট করুন',
    actionPrintDesc: 'নকশা ও একক তালিকা সহ পরিচ্ছন্ন এক পাতার প্রিন্ট কপি।',
    actionPng: 'PNG ছবি ডাউনলোড',
    actionPngDesc: 'হোয়াটসঅ্যাপ বা নথির জন্য ১৬০০×১১২০০ পিক্সেল পরিষ্কার ছবি।',
    actionSvg: 'ভেক্টর SVG ডাউনলোড',
    actionSvgDesc: 'যেকোনো বড় আকারে প্রিন্ট করার উপযোগী স্কেলেবল নকশা।',
    actionNativeShare: 'ডিভাইস থেকে শেয়ার করুন',
    actionNativeShareDesc: 'নকশার ছবি ও হিসাব সরাসরি শেয়ার মেনুতে পাঠান।',
    actionCopyText: 'টেক্সট সারাংশ কপি',
    actionCopyTextDesc: 'মেসেজ বা হোয়াটসঅ্যাপে পাঠানোর জন্য পরিচ্ছন্ন হিসাব কপি করুন।',
    copiedToast: 'হিসাব ক্লিপবোর্ডে কপি হয়েছে',
    close: 'বন্ধ করুন',
    printReportTitle: 'জমির ক্ষেত্রফল জরিপ প্রতিবেদন',
    printGeneratedLocally: 'ডিভাইসে অফলাইনে নির্ণিত · নির্ভুল হেরন ত্রিভুজ পদ্ধতি · বাংলাদেশি সরকারি একক',
    ftPlaceholder: 'ফুট',
    inPlaceholder: 'ইঞ্চি',
    jumpToDiagram: 'নকশা ↓',
    tapEdgeHint: 'মাপ লিখতে যেকোনো বাহুতে ট্যাপ করুন',
    auto90Corner: '৯০° কোণ',
    stepSides: '১. চার পাশের দৈর্ঘ্য',
    stepDiagonal: '২. একটি কর্ণের দৈর্ঘ্য',
    advancedGeometry: 'জমির আকৃতি (উত্তল / বাঁকা)',
    navSavedShort: 'সংরক্ষিত',
    navUnitsShort: 'একক',
    navShareShort: 'শেয়ার',
  },
};
