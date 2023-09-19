/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 */
define(['N', './lib/Lib.JournalAmortizationManager'],

    (N, JournalAmortizationManager) => {

        const { log } = N;


        const getInputData = (context) => {

            log.debug('Start Procedure', '-----------------------');

            let resultSet = JournalAmortizationManager.getAmortizationJournalList();

            log.debug('Total Transactions', resultSet.length);

            return resultSet;

        }


        const map = (context) => {
            try {

                let journalId = context.value;

                if (journalId) {
                    log.debug('Journal', journalId);
                    JournalAmortizationManager.executeForeignAction(journalId, 'create');
                    log.debug('Journal', 'Completed');

                }

            }
            catch (err) {
                log.error('err', err)
            }
        }


        const summarize = (context) => {

            log.debug('end Procedure', '-----------------------');

        }

        return { getInputData, map, summarize }

    });
