/**
 * @NApiVersion 2.1
 * @NScriptType ClientScript
 * @NModuleScope SameAccount
 */
define(['N'],

    function (N) {


        const { url } = N;

        const SUITELET_SCRIPT = {
            id: 'customscript_bm_purchase_amor_set_stlt',
            deployment: 'customdeploy_bm_purchase_amor_set_stlt'
        }

        function fieldChanged(scriptContext) {

            if (scriptContext.fieldId == 'custpage_field_subsidiary') {
                let value = scriptContext.currentRecord.getValue(scriptContext.fieldId);

                let path = url.resolveScript({
                    scriptId: SUITELET_SCRIPT.id,
                    deploymentId: SUITELET_SCRIPT.deployment,
                    params: { _subsi: value },
                })
                setWindowChanged(window, false);
                window.location.href = path;
            }

        }



        return {
            fieldChanged: fieldChanged,
        };

    });
