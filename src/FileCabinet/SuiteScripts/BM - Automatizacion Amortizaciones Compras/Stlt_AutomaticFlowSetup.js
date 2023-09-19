/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['N', './lib/Lib.AutomaticFlowDao', './lib/Lib.AutomaticFlowAmortizations'],

    (N, Dao, { AmoritzationSetup }) => {

        const { log, runtime, redirect } = N;

        const { serverWidget, message } = N.ui;

        const SUITELET_CONTEXT = {
            title: 'custpage_title_amoritzation',
            groups: {
                criteria: 'custpage_group_setup',
            },
            fields: {
                subsidiary: 'custpage_field_subsidiary',
                item: 'custpage_field_item',
                foreign: 'custpage_field_check_foreign'
            },
            messages: {
                save: 'custpage_message_save'
            }
        }

        function adapterTranslateLanguage(daoContext) {

            let context = {};
            for (var key in SUITELET_CONTEXT.fields) {

                context[key] = {
                    id: SUITELET_CONTEXT.fields[key],
                    text: daoContext.get(SUITELET_CONTEXT.fields[key])
                }
            };

            return context;

        }

        function onRequest(context) {

            let daoContext = new Dao();

            let translates = adapterTranslateLanguage(daoContext);

            let amoritzationSetup = new AmoritzationSetup();

            if (context.request.method == 'GET') {

                let form = serverWidget.createForm(daoContext.get(SUITELET_CONTEXT.title));

                form.addSubmitButton(daoContext.get('custpage_button_save'));

                form.clientScriptModulePath = './Clnt.AutomaticFlowSetup.js'

                // Create Subsidiary Field
                let subsidiaryField = form.addField({
                    id: translates.subsidiary.id,
                    label: translates.subsidiary.text,
                    type: 'select',
                });
                subsidiaryField.isMandatory = true;
                subsidiaryField.updateLayoutType({
                    layoutType: serverWidget.FieldLayoutType.OUTSIDEABOVE
                });

                subsidiaryField.addSelectOption({ value: '', text: '' });

                Object.values(amoritzationSetup.getAll()).forEach(node => {
                    subsidiaryField.addSelectOption({ value: node.id, text: node.name });
                })

                // Add Group
                form.addFieldGroup({
                    id: SUITELET_CONTEXT.groups.criteria,
                    label: daoContext.get(SUITELET_CONTEXT.groups.criteria)
                }).isSingleColumn = true;

                // Add Item in the Criteria Group
                let itemField = form.addField({
                    id: translates.item.id,
                    label: translates.item.text,
                    type: 'select',
                    source: 'item',
                    container: SUITELET_CONTEXT.groups.criteria
                });

                let foreignCheckField = form.addField({
                    id: translates.foreign.id,
                    label: translates.foreign.text,
                    type: 'checkbox',
                    container: SUITELET_CONTEXT.groups.criteria
                });

                //Set Default Values
                let isSave = context.request.parameters["save"];

                if (isSave == 'T') {

                    form.addPageInitMessage({
                        message: daoContext.get(SUITELET_CONTEXT.messages.save),
                        duration: 10000,
                        type: message.Type.CONFIRMATION
                    })
                }
                let subsidiary = context.request.parameters['_subsi'];

                subsidiaryField.defaultValue = subsidiary;

                let itemSetup = null;
                let foreignSetup = 'F';
                if (subsidiary) {
                    itemSetup = amoritzationSetup.getItem(subsidiary);
                    foreignSetup = amoritzationSetup.isEnabledForeignFlow(subsidiary);
                    foreignSetup = foreignSetup ? 'T' : 'F';
                }
                itemField.defaultValue = itemSetup;
                foreignCheckField.defaultValue = foreignSetup;

                context.response.writePage(form);

            } else {

                let subsidiary = context.request.parameters[SUITELET_CONTEXT.fields.subsidiary];
                let item = context.request.parameters[SUITELET_CONTEXT.fields.item];
                let foreign = context.request.parameters[SUITELET_CONTEXT.fields.foreign]

                amoritzationSetup.updateSubsidiary(subsidiary, item, foreign);

                redirect.toSuitelet({
                    scriptId: runtime.getCurrentScript().id,
                    deploymentId: runtime.getCurrentScript().deploymentId,
                    parameters: { save: 'T', _subsi: subsidiary }
                })

            }

        }

        return { onRequest }

    });
