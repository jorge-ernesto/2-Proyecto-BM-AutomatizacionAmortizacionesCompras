/**
 * @NApiVersion 2.1
 */
define(['N'],

  function (N) {

    const { runtime, log } = N;

    const HEADER = {
      "en": 1,
      "es": 2,
    };


    const TRANSLATE = [
      ['custpage_title_amoritzation', 'Purchase Amorzitation Setup', 'Configuración de Amortizacion de Compra'],
      ['custpage_field_subsidiary', 'Subsidiary', 'Subsidiaria'],
      ['custpage_field_item', 'Item Selected', 'Item Seleccionado'],
      ['custpage_field_check_foreign', 'Generate Amortization Journal (Foreign Currency)', 'Generar Asiento de Amortizacion (Otras Monedas)'],
      ['custpage_group_setup', 'Setup', 'Configuración'],
      ['custpage_message_save', 'The Subsidiary was configured correctly', 'La Subsidiaria fue configurada correctamente'],
      ['custpage_button_save', 'Save', 'Guardar']
    ]

    class Dao {

      constructor() {

        let language = runtime.getCurrentUser().getPreference('language').substring(0, 2);

        //The Default Language will be Spanish
        let currentLanguage = HEADER[language] ? HEADER[language] : 2;

        let labelMap = {};

        TRANSLATE.forEach(line => {
          let id = line[0];
          let label = line[currentLanguage];
          labelMap[id] = label
        });
        this.data = labelMap;
      }

      get(key) {
        return this.data[key] ? this.data[key] : 'Undefined';
      }
    }

    return Dao;

  });
