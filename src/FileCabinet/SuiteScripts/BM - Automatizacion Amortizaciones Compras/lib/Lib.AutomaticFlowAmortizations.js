/**
 * @NApiVersion 2.1
 */
define(['N'],

    function (N) {

        const { record, search, log } = N;

        const CONFIG_RECORD = {
            type: 'customrecord_bm_p_amortization_setup',
            fields: {
                item: 'custrecord_bm_auto_p_am_item',
                subsidiary: 'custrecord_bm_auto_p_am_subsi',
                foreignFlow: 'custrecord_bm_am_enable_foreign'
            }
        }

        function getConfigurationItem(subsidiary) {

            if (!subsidiary) return null;

            let item = null;

            search.create({
                type: CONFIG_RECORD.type,
                columns: [CONFIG_RECORD.fields.item],
                filters: [
                    [CONFIG_RECORD.fields.subsidiary, 'anyof', subsidiary]
                ]
            }).run().each(node => {

                item = node.getValue(node.columns[0]);
                return false;
            })
            return item;

        }


        function hasAmortizationConfigured(recordContext) {

            let isDynamic = recordContext.isDynamic;

            let itemLength = recordContext.getLineCount('item');

            let hasAmortization = false;

            for (var i = 0; i < itemLength; i++) {
                let amortizationsched = null;
                if (isDynamic) {
                    recordContext.selectLine({ sublistId: 'item', line: i });
                    amortizationsched = recordContext.getCurrentSublistValue('item', 'amortizationsched');
                } else {
                    amortizationsched = recordContext.getSublistValue('item', 'amortizationsched', i);
                }
                if (amortizationsched) {
                    hasAmortization = true;
                    break;
                }
            }
            return hasAmortization;
        }

        function isAffectedByWht(recordContext) {

            let line = recordContext.findSublistLineWithValue({
                sublistId: 'item',
                fieldId: 'custcol_4601_witaxapplies',
                value: 'T'
            });

            return line > -1 ? true : false;

        }

        function getWHTLine(recordContext) {

            let line = recordContext.findSublistLineWithValue({
                sublistId: 'item',
                fieldId: 'custcol_4601_witaxline',
                value: 'T'
            });

            return line;

        }


        function removeCustomLine(recordContext) {

            let customLine = recordContext.findSublistLineWithValue({
                sublistId: 'item',
                fieldId: 'custcol_4601_witaxline',
                value: 'AL'
            });
            if (customLine) {
                log.debug('Custom Line Amortization', customLine);
                recordContext.removeLine({ sublistId: 'item', line: customLine, ignoreRecalc: true });
            }
        }


        function addCustomLineInTransaction(recordContext) {

            log.debug('addCustomLineInTransaction', '----- Start -----')
            try {

                removeCustomLine(recordContext);

                let subsidiary = recordContext.getValue('subsidiary');

                let itemConfigured = getConfigurationItem(subsidiary);

                if (!itemConfigured) throw 'The subsidiary is not configured';

                if (!hasAmortizationConfigured(recordContext)) {
                    log.debug('AutomatedAmortizationPurchase.Details',
                        'The transaction has not any amoritzation template configured');
                    return;
                }

                log.debug('Record Has Amortization', 'True');

                if (!isAffectedByWht(recordContext)) {
                    log.debug('AutomatedAmortizationPurchase.Details',
                        'The transaction is not affected by withholding tax flow');
                    return;
                }

                log.debug('Has Wht Lines', 'True');

                let isDynamic = recordContext.isDynamic;

                let whtLine = getWHTLine(recordContext);

                log.debug('Wht Line', whtLine);

                if (whtLine) {
                    recordContext.insertLine({ sublistId: 'item', line: whtLine });
                    if (isDynamic) {

                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: itemConfigured });
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: '- Amortization Line -' })
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: 0 });
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_4601_witaxline', value: 'AL' });

                        recordContext.commitLine('item')
                    } else {
                        recordContext.setSublistValue('item', 'item', whtLine, itemConfigured);
                        recordContext.setSublistValue('item', 'description', whtLine, '- Amortization Line -');
                        recordContext.setSublistValue('item', 'quantity', whtLine, 1);
                        recordContext.setSublistValue('item', 'rate', whtLine, 0);
                        recordContext.setSublistValue('item', 'custcol_4601_witaxline', whtLine, 'AL');
                    }

                } else {

                    if (isDynamic) {
                        recordContext.selectNewLine('item');
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'item', value: itemConfigured });
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'description', value: '- Amortization Line -' })
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'quantity', value: 1 });
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'rate', value: 0 });
                        recordContext.setCurrentSublistValue({ sublistId: 'item', fieldId: 'custcol_4601_witaxline', value: 'AL' });
                        recordContext.commitLine('item')
                    } else {
                        let lastLine = recordContext.getLineCount('item');
                        recordContext.insertLine({ sublistId: 'item', lastLine, line: lastLine });
                        recordContext.setSublistValue('item', 'item', lastLine, itemConfigured);
                        recordContext.setSublistValue('item', 'description', lastLine, '- Amortization Line -');
                        recordContext.setSublistValue('item', 'quantity', lastLine, 1);
                        recordContext.setSublistValue('item', 'rate', lastLine, 0);
                        recordContext.setSublistValue('item', 'custcol_4601_witaxline', lastLine, 'AL');

                    }

                }


            } catch (err) {
                log.error('AutomatedAmortizationPurchase.error', err);
            }
            log.debug('addCustomLineInTransaction', '----- End -----')

        }


        class AmoritzationSetup {

            constructor() {

                let subsidiaryMap = {};

                // Only get the peru subsidiaries
                let countries = ['PE'];

                // Get all subsidiaries
                search.create({
                    type: 'subsidiary',
                    columns: ['internalid', 'name'],
                    filters: [
                        ['country', 'anyof'].concat(countries),
                        'AND',
                        ['isinactive', 'is', 'F']
                    ]
                }).run().each(node => {
                    subsidiaryMap[node.id] = {
                        id: node.id,
                        name: node.getValue(node.columns[1]),
                        item: null,
                        foreignFlow: false,
                        setup: null
                    }
                    return true;
                });

                search.create({
                    type: CONFIG_RECORD.type,
                    columns: [CONFIG_RECORD.fields.subsidiary, CONFIG_RECORD.fields.item, CONFIG_RECORD.fields.foreignFlow]
                }).run().each(node => {

                    let setupId = node.id;
                    let subsidiary = node.getValue(node.columns[0]);
                    let item = node.getValue(node.columns[1]);
                    let foreignFlow = node.getValue(node.columns[2])

                    subsidiaryMap[subsidiary].item = item;
                    subsidiaryMap[subsidiary].setup = setupId;
                    subsidiaryMap[subsidiary].foreignFlow = foreignFlow == 'T' || foreignFlow == true ? true : false;
                    return true;
                });

                this.subsidiaryMap = subsidiaryMap;

            }

            getAll() {
                return this.subsidiaryMap;
            }

            getItem(subsidiary) {
                return this.subsidiaryMap[subsidiary].item
            }

            isEnabledForeignFlow(subsidiary) {
                log.error('this', this);
                return this.subsidiaryMap[subsidiary].foreignFlow

            }

            updateSubsidiary(subsidiary, item, foreignCheck) {

                let setupId = this.subsidiaryMap[subsidiary].setup;

                let setupRecord = null;

                if (setupId) {
                    setupRecord = record.load({ type: CONFIG_RECORD.type, id: setupId });
                } else {
                    setupRecord = record.create({ type: CONFIG_RECORD.type });
                    setupRecord.setValue(CONFIG_RECORD.fields.subsidiary, subsidiary);
                }

                setupRecord.setValue(CONFIG_RECORD.fields.item, item);
                setupRecord.setValue(CONFIG_RECORD.fields.foreignFlow, foreignCheck == 'T' || foreignCheck == true ? true : false);


                this.subsidiaryMap[subsidiary].setup = setupRecord.save();
                this.subsidiaryMap[subsidiary].item = item;
                this.subsidiaryMap[subsidiary].foreignFlow = foreignCheck == 'T' || foreignCheck == true ? true : false;
            }

        }



        return {
            addCustomLineInTransaction,
            AmoritzationSetup
        }


    });
