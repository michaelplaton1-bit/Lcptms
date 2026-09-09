// LCPTMS Berth Geography / Route Map v0.2
// Operational references use Chart 11339 nomenclature.
// GPS coordinates remain null until cross-checked against current NOAA ENC.

export const BERTH_GEOGRAPHY_VERSION="0.2.0";
export const GEO_STATUS=Object.freeze({
  NOAA_CROSSCHECK_PENDING:"NOAA_CROSSCHECK_PENDING",
  NOAA_VERIFIED:"NOAA_VERIFIED"
});
function entry(x){return {...x,latitude:null,longitude:null,geoStatus:GEO_STATUS.NOAA_CROSSCHECK_PENDING,chartReference:"11339 / current NOAA ENC cross-check"};}
export const BERTH_GEOGRAPHY=Object.freeze([
  entry({codes:['VG-S','VG-N'],reference:'BETWEEN_BEACON_48_AND_50',side:'EAST',offsetNm:None,bearing:None,branch:'CALCASIEU_SHIP_CHANNEL',notes:'Between Beacons 48 and 50 on east side of channel.'}),
  entry({codes:['CLNG-S','CLNG-N'],reference:'BEACON_85',side:'WEST',offsetNm:1.0,bearing:'S',branch:'CALCASIEU_SHIP_CHANNEL',notes:'1 NM south of Beacon 85 on west side.'}),
  entry({codes:['ALCOA'],reference:'INDUSTRIAL_CANAL_BASIN',side:None,offsetNm:1.5,bearing:'W',branch:'INDUSTRIAL_CANAL',notes:"1.5 NM west of Industrial Canal Basin, NE of Devil's Elbow."}),
  entry({codes:['CII','WLS'],reference:'BEACON_106',side:None,offsetNm:None,bearing:'W',branch:'SLIP',notes:'In slip directly west of Beacon 106.'}),
  entry({codes:['P66/CR'],reference:'BEACON_108',side:None,offsetNm:1.0,bearing:'N',branch:'CALCASIEU_SHIP_CHANNEL',notes:'1 NM due north of Beacon 108.'}),
  entry({codes:['CS/CR'],reference:'BEACON_109',side:None,offsetNm:1.0,bearing:'WSW',branch:'CALCASIEU_SHIP_CHANNEL',notes:'1 NM WSW of Beacon 109.'}),
  entry({codes:['CS/B','CS/C'],reference:'BEACON_112',side:None,offsetNm:1.0,bearing:'W',branch:'CALCASIEU_SHIP_CHANNEL',notes:'1 NM west of Beacon 112.'}),
  entry({codes:['CS/D'],reference:'BEACON_114',side:None,offsetNm:1.0,bearing:'W',branch:'CALCASIEU_SHIP_CHANNEL',notes:'1 NM west of Beacon 114.'}),
  entry({codes:['A4 ANCHORAGE','A4'],reference:'BEACON_114',side:None,offsetNm:1.0,bearing:'SW',branch:'ANCHORAGE',notes:'1 NM SW of Beacon 114.'}),
  entry({codes:['BT1-O','BT1-N','BT-1N'],reference:'I210_BRIDGE',side:None,offsetNm:2.0,bearing:'WSW',branch:'CALCASIEU_SHIP_CHANNEL',notes:'2 NM WSW of I-210 Bridge.'}),
  entry({codes:['WC/A'],reference:'COON_ISLAND_FL_R_6S_17FT_3M_6',side:None,offsetNm:0.25,bearing:'W',branch:'COON_ISLAND_CHANNEL',notes:'0.25 NM west of Fl R 6s 17ft 3M "6".'}),
  entry({codes:['WC/C'],reference:'COON_ISLAND_R_12',side:None,offsetNm:0.5,bearing:'N',branch:'COON_ISLAND_CHANNEL',notes:'0.5 NM north of R "12".'}),
  entry({codes:['CD9','CD10','CD11','CD9-10-11'],reference:'CONTRABAND_BAYOU_CORNER',side:None,offsetNm:None,bearing:None,branch:'CONTRABAND_BAYOU',notes:'Contraband Bayou beginning at the corner.'}),
  entry({codes:['CD8'],reference:'BEACON_119',side:None,offsetNm:0.5,bearing:'E',branch:'CALCASIEU_SHIP_CHANNEL',notes:'0.5 NM east of Beacon 119.'}),
  entry({codes:['CD5','CD4','CD3','CD2','CD1','CD5-4-3-2-1'],reference:'FL_R_2_5S_B_PRIV',side:None,offsetNm:None,bearing:'E',branch:'CITY_DOCKS',notes:'Sequence begins at Fl R 2.5s "B" Priv and proceeds east.'}),
  entry({codes:['P66/3'],reference:'CLOONEY_ISLAND',side:None,offsetNm:1.0,bearing:'NE',branch:'CALCASIEU_SHIP_CHANNEL',notes:'1 NM NE of Clooney Island in the bend.'}),
  entry({codes:['BT4','DP','BT4/DP'],reference:'BEACON_130',side:'WEST',offsetNm:None,bearing:None,branch:'CALCASIEU_SHIP_CHANNEL',notes:'At Beacon 130 on west side.'})
]);
function norm(v){return String(v||"").trim().toUpperCase().replace(/\s+/g," ");}
export function resolveBerthGeography(code){
  const q=norm(code);
  if(!q)return {status:"NO_BERTH",code:code??null,geography:null};
  for(const geo of BERTH_GEOGRAPHY){
    if(geo.codes.map(norm).includes(q))return {status:"MAPPED_OPERATIONAL",code,geography:geo};
  }
  return {status:"UNMAPPED",code,geography:null};
}
export function listPendingNoaaCrosschecks(){
  return BERTH_GEOGRAPHY.filter(x=>x.geoStatus===GEO_STATUS.NOAA_CROSSCHECK_PENDING)
    .map(x=>({codes:x.codes,reference:x.reference,notes:x.notes}));
}
