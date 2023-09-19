/**
 * @NApiVersion 2.1
 * @NScriptType Suitelet
 */
define(['../lib/Lib.JournalAmortizationManager', 'N'],

    (JournalAmortizationManager, N) => {


        const { log } = N;

        function onRequest(context) {

            let journalId = 894835;

            log.debug('Start', new Date());

            JournalAmortizationManager.executeForeignAction(journalId, 'create');

            log.debug('End', new Date());


        }

        return { onRequest }


    });
