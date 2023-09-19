/**
 * @NApiVersion 2.1
 * @NScriptType UserEventScript
 */
define(['./lib/Lib.AutomaticFlowAmortizations'],

    (Lib_AmoritzationFlow_Module) => {



        function beforeSubmit(scriptContext) {

            Lib_AmoritzationFlow_Module.addCustomLineInTransaction(scriptContext.newRecord)

        }



        return { beforeSubmit }

    });
