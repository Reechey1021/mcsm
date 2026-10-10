// services/cloud/fake-seed.js
// Starting data for the test backend: the MCSM31 entry list as published on mcsm.hu
// (names, PSN IDs, DR/SR), team names from the old site, and two test accounts.
// Team pairings, race numbers and setups are made up.

export const RAW = `A+|S|SAGHMEISTER|Szabolcs|IGTSH_Saby
A+|S|HORNYÁK|Torda|IGTSH_Tordi
A+|S|FICSOR|Szabolcs|MGTK_Dudu
A+|S|SZALAI|Roland|MGTK_Rolol
A+|S|BIRGÉS|Attila|MGTK_ATES
A+|S|KARAKÓ|Csaba|MGTK_MAZ
A+|S|NAGY|Dominik|IGTSH_iamD
A+|S|BELENCSÁK|Ádám|MGTK_b3lik
A+|S|NAGY|Andor|MGTK_Andor
A+|S|DERGEZ|Attila|IGTSH_Dixen
A+|S|OTTLIK|Csaba|MGTK_Shosta
A+|S|KINDÓ|Tamás|MGTK_Babo
A+|S|TAKÓ|Gábor|IGTSH_BOSS
A+|S|KÁTAI|Gábor|IGTSH_Mara
A+|S|HEGYI|Bálint|IGTSH_Batm
A+|S|SIMON|Imre|IGTSH_Smn
A+|S|KRÉMER|Péter|GL_petipety
A|S|PÁL|Attila|MGTK_HOPI
A|S|BŐDI|Endre|MGTK_Enos
A|S|DRENKOVICS|Tamás|MGTK_Noth
A|S|GYŐRE|Tamás|MGTK_Kekx
A|S|GESZTELYI|Adam|TurboMokus
A|S|IGNÁCZ|Ádám|MGTK_Igjoe
A|S|ISZLAI|Csaba|GTHH_Speed
A|S|NAGY|György|MGTK_Babl
A|S|NAGY-W|Árpád|JOMcKUR
A|S|BARANYI|Norbert|Libalak_
A|S|TŐKÉS|Róbert|HRT-ROBI
A|S|KOVÁCS|Dávid|Dacka007
A|A|BALOGH|Norbert|IGTSH_Buld
B|S|HÓMAN|Roland|MGTK_HRol
B|S|SZANYI|Máté|MGTK_Mate
B|S|SISA|Ádám|MGTK_M.Ma
B|A|KONKOLY|Attila|GTHL_ATES
B|S|VAJK|Zoltán|Zoyek1970
B|S|KOVÁCS|Imre|SlowDaddy6
B|B|MÁNDI|Ferenc|MGTK_AlfaF
B|A|RÁCZ|Zsolt|MGTK_IgorF
B|S|JUHÁSZ|Bence|GTHL_Beni
C|S|KÓNYA|Ottó|MGTK_Bigfo
C|S|HORVÁTH|András|MGTK_Band
C|S|VÉGH|István|Vader45376
C|S|MAYER|Ádám|MGTK_Maye
C|S|KHELL|Csaba|KhellCsaba
C|S|PERGEL|István|MGTK_Pergi
C|S|SCHÄFER|Gergő|kismokusss
C|S|VAS|Péter|palacsinta81`;

export const TEAM_NAMES = ['#NOTIME2PLAY', 'ACTA ESPORTS', 'AUTOBAHN', 'B&B FUN', 'BIGCAT', 'BITURBO', 'BLACK SHEEP', 'CHALLENGERS', 'COBRA KAI', 'GHOST RACING',
  'KINDER', 'MÁMA', 'MARLBORO MEN', 'MESAVERDE', 'MULTI21', 'NINJAZ', 'PAPAYA RULES', 'POWERDOSE', 'PR1ME LINE', 'RAGE RUNNERS', 'SEVENTH GEAR',
  'SUFNI TUNING', 'SUPERSONIC', 'SWEATY BULLETS'];

export const GT_TEAMS = [['IGTSH', 'Independent GTS Hungary'], ['MGTK', 'Magyar Gran Turismo Klub'], ['GL', 'GL'], ['GTHH', 'GTHH'], ['GTHL', 'GTHL'], ['MTK', 'MTK'], ['OBH', 'OBH'], ['ACTA', 'ACTA ESPORTS']];
