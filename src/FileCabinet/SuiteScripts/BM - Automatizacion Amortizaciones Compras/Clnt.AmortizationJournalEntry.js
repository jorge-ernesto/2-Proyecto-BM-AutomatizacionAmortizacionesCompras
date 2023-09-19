/**
 * @NApiVersion 2.1
 */
define(['N'],

  (N) => {


    function executeFlow() {

      if (confirm('Se crearán transacciones adicionales.\n¿Deseas Continuar?')) {

        let { url, currentRecord } = N;

        let recordContext = currentRecord.get();

        window.location.href = url.resolveRecord({
          isEditMode: false,
          recordId: recordContext.id,
          recordType: recordContext.type,
          params: {
            _foreign: 'E'
          }
        })
      }

    }

    return { executeFlow }

  });
