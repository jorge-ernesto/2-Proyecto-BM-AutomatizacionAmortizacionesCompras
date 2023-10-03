// Notas del archivo:
// - Secuencia de comando:
//      - BM - Amortization Journal User Event (customscript_bm_aj_user_event)
// - Registro:
//      - Asiento diario (journalentry)

/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['./lib/Lib.JournalAmortizationManager', 'N'],

  (JournalAmortizationManager, N) => {

    function beforeLoad(context) {

      if (context.type == 'view' && context.form) {
        context.form.clientScriptModulePath = './Clnt.AmortizationJournalEntry.js';
      }

      JournalAmortizationManager.manageForm(context);

    }

    function afterSubmit(context) {

      if (context.type == 'delete') {
        JournalAmortizationManager.executeForeignAction(context.oldRecord, 'delete');
      }

    }

    return { beforeLoad, afterSubmit }

  });
