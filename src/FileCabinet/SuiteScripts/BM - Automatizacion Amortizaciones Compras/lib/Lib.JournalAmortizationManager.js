/**
 * @NApiVersion 2.1
 */
define(['N'],

  function (N) {

    /**
     * Get Netsuite Libraries
     */
    const { record, search, log, redirect, runtime } = N;

    /**
     * Object Context
     */
    const AMORTIZATION_JOURNAL_RECORD = {
      type: 'journalentry',
      fields: {
        isAmortization: 'isfromamortization',
        foreignFlow: 'custbody_bm_foreign_ja_completed',
      },
      columns: {
        amortizationSchedule: 'schedulenum',
        reverseJournal: 'custcol_bm_reverse_ja',
        foreignJournal: 'custcol_bm_foreign_ja',
        department: 'department',
        class: 'class',
        location: 'location',
        tranIdTransaction: 'custcol24'
      }
    }
    log.audit('AMORTIZATION_JOURNAL_RECORD', AMORTIZATION_JOURNAL_RECORD);

    /**
     * @param {Integer} subsidiary
     * @description
     * check if the subsidiary has feature enabled
     * @returns {Boolean}
     */
    function isFeatureEnabled(subsidiary) {

      let status = false;

      search.create({
        type: 'customrecord_bm_p_amortization_setup',
        columns: ['custrecord_bm_am_enable_foreign'],
        filters: [
          ['custrecord_bm_auto_p_am_subsi', 'anyof', subsidiary]
        ]
      }).run().each(node => {

        status = node.getValue('custrecord_bm_am_enable_foreign'); // * Audit: Busqueda, esto era posible en una busqueda?
        status = status == 'T' || status == true ? true : false;

        return false;
      })

      return status;
    }

    /**
     * @param {Record} journalRecord Journal Record
     * @description
     * Check if the journal record belongs to the amortization flow.
     * @returns {Boolean}
     */
    function isAmortizationJournal(journalRecord) {
      let value = journalRecord.getValue(AMORTIZATION_JOURNAL_RECORD.fields.isAmortization); // * Audit: isfromamortization

      return value == 'T' || value == true ? true : false;
    }

    /**
     * @param {Record} journalRecord
     * @description
     * Get the amortization scheduled related to Journal Record
     * @returns {Array}
     */
    function getAmortizationSchedules(journalRecord) {

      let amortizationScheduleMap = {} // * Audit: Util

      let totalLines = journalRecord.getLineCount('line');
      for (var i = 0; i < totalLines; i++) {

        let currentAmortizationScheduled = journalRecord.getSublistValue('line',
          AMORTIZATION_JOURNAL_RECORD.columns.amortizationSchedule, i);

        if (currentAmortizationScheduled) {
          amortizationScheduleMap[currentAmortizationScheduled] = true;
        }

      }

      return Object.keys(amortizationScheduleMap);

    }

    /**
     * @description
     * Get the Map when the key is the internal id of the subsidiary and the value
     * is the currency of the subsidiary
     * @returns {Object}
     */
    function getCurrencyBySubsidiary() {

      let currentSubsidiaryMap = {}; // * Audit: Util, manejo de JSON
      search.create({ type: 'subsidiary', columns: ['internalid', 'currency'] })
        .run().each(node => {
          currentSubsidiaryMap[node.id] = node.getValue('currency');
          return true;
        });
      return currentSubsidiaryMap;
    }

    /**
     * @param {Array} currentList Amoritization Scheduled IDs
     * @description
     * Get Amortization Scheduled Map
     * @returns {Object}
     */
    function getOnlyAmortizationWithForeignCurrency(currentList) {

      let amortizationScheduledMap = {}; // * Audit: Util, manejo de JSON

      let currencySubsidiaryMap = getCurrencyBySubsidiary();

      search.create({
        type: "amortizationschedule",
        filters:
          [
            ['internalid', 'anyof'].concat(currentList) // * Audit: Util, concat
          ],
        columns:
          [
            { name: "internalid", summary: "GROUP", },
            { name: "linesequencenumber", summary: "COUNT", },
            { name: "fxamount", join: "transaction", summary: "GROUP", },
            { name: "exchangerate", join: "transaction", summary: "GROUP", },
            { name: "currency", join: "transaction", summary: "GROUP", },
            { name: "subsidiary", join: "transaction", summary: "GROUP", },
            { name: "formulanumeric", summary: "SUM", formula: "ROUND({recurfxamount}/{transaction.exchangerate},2)" },
            { name: "linesequencenumber", summary: "MIN" },
            { name: "linesequencenumber", summary: "MAX" },
            { name: "mainname", join: "transaction", summary: "GROUP" },
            { name: "tranid", join: "transaction", summary: "GROUP" } // Add Tran ID

          ]
      }).run().each(node => {

        let amortizationScheduledId = node.getValue(node.columns[0]);
        let quantityLines = Number(node.getValue(node.columns[1]));
        let transactionAmount = Number(node.getValue(node.columns[2]));
        let exchangeRate = Number(node.getValue(node.columns[3]));
        let transactionCurrency = node.getValue(node.columns[4]);
        let transactionSubsidiary = node.getValue(node.columns[5]);
        let amortizationscheduleAmount = Number(node.getValue(node.columns[6]));
        let minLine = Number(node.getValue(node.columns[7]));
        let maxLine = Number(node.getValue(node.columns[8]));
        let entity = node.getValue(node.columns[9]);
        let tranid = node.getValue(node.columns[10]);
        let subsidiaryCurrency = currencySubsidiaryMap[transactionSubsidiary];

        if (transactionCurrency != subsidiaryCurrency) {

          let addtionalAmount = (transactionAmount - amortizationscheduleAmount).toFixed(2);

          amortizationScheduledMap[amortizationScheduledId] = {
            totalLines: quantityLines,
            transactionAmount: transactionAmount,
            scheduledAmount: amortizationscheduleAmount,
            exchangeRate: exchangeRate,
            minLine: minLine,
            maxLine: maxLine,
            addtionalAmount: Number(addtionalAmount),
            currency: transactionCurrency,
            entity: entity,
            tranid: tranid
          }
        }

        return true;
      });
      return amortizationScheduledMap;
    }

    /**
     * @param {Record} journalRecord
     * @description
     * Get the values of the Journal Record
     * @returns {Object} Get the Object Information related to Journal
     */
    function generalInformation(journalRecord) {

      return {
        form: journalRecord.getValue('customform'),
        period: journalRecord.getValue('postingperiod'),
        subsidiary: journalRecord.getValue('subsidiary'),
        date: journalRecord.getValue('trandate'),
        currency: journalRecord.getValue('currency')
      }

    }

    /**
     * @param {Record} journalRecord Journal Record
     * @param {Object} amortizationScheduleMap Amortization Map (key , value)
     * @description
     * Create a rever journal
     * @returns {Integer} Journal Record
     */
    function createReverseJournal(journalRecord, amortizationScheduleMap) {

      let journalInformation = generalInformation(journalRecord);

      let reverseLines = [];

      let totalLines = journalRecord.getLineCount('line');

      for (var i = 0; i < totalLines; i++) {

        let account = journalRecord.getSublistValue('line', 'account', i);
        let debit = journalRecord.getSublistValue('line', 'debit', i);
        let credit = journalRecord.getSublistValue('line', 'credit', i);
        let entity = journalRecord.getSublistValue('line', 'entity', i)
        let schedulenum = journalRecord.getSublistValue('line', 'schedulenum', i);
        let memo = journalRecord.getSublistValue('line', 'memo', i);

        let _class = journalRecord.getSublistValue('line', 'class', i);
        let _department = journalRecord.getSublistValue('line', 'department', i);
        let _location = journalRecord.getSublistValue('line', 'location', i);

        if (amortizationScheduleMap[schedulenum]) {
          reverseLines.push({
            account,
            debit,
            credit,
            entity,
            memo,
            class: _class,
            department: _department,
            location: _location,
            tranid: amortizationScheduleMap[schedulenum].tranid
          })
        }
      }

      if (reverseLines.length == 0) { return };

      let reverseJournalRecord = record.create({ type: 'journalentry', isDynamic: true });

      reverseJournalRecord.setValue('customform', journalInformation.form);
      reverseJournalRecord.setValue('subsidiary', journalInformation.subsidiary);
      reverseJournalRecord.setValue('currency', journalInformation.currency);
      reverseJournalRecord.setValue('period', journalInformation.period);
      reverseJournalRecord.setValue('trandate', journalInformation.date);
      reverseJournalRecord.setValue('isfromamortization', true);

      reverseLines.forEach(currentLine => {

        let { account, debit, credit, entity, memo } = currentLine;

        reverseJournalRecord.selectNewLine('line');

        reverseJournalRecord.setCurrentSublistValue('line', 'account', account);
        reverseJournalRecord.setCurrentSublistValue('line', 'memo', memo + ' (Reverse)');

        if (debit) {
          reverseJournalRecord.setCurrentSublistValue('line', 'credit', debit);
        }

        if (credit) {
          reverseJournalRecord.setCurrentSublistValue('line', 'debit', credit);
        }

        reverseJournalRecord.setCurrentSublistValue('line', 'entity', entity);

        if (currentLine.class) {
          reverseJournalRecord.setCurrentSublistValue('line', 'class', currentLine.class);
        }
        if (currentLine.department) {
          reverseJournalRecord.setCurrentSublistValue('line', 'department', currentLine.department);
        }
        if (currentLine.location) {
          reverseJournalRecord.setCurrentSublistValue('line', 'location', currentLine.location);
        }

        if (currentLine.tranid) {
          reverseJournalRecord.setCurrentSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.tranIdTransaction, currentLine.tranid);
        }

        reverseJournalRecord.commitLine('line');

      });

      return reverseJournalRecord.save({ ignoreMandatoryFields: true, disableTriggers: true })

    }

    /**
     * @param {Object} amortizationScheduleMap
     * @description
     * Transform the input to new Object when the key will be the currency and
     * it has one propperty:
     * - Templates : is an array
     * @returns {Object}
     */
    function groupAmortizationByCurrency(amortizationScheduleMap) {

      let currencyMap = {}; // * Audit: Util, manejo de JSON

      for (var scheduled in amortizationScheduleMap) { // * Audit: Util, for in

        let currency = amortizationScheduleMap[scheduled].currency;

        if (!currencyMap[currency])
          currencyMap[currency] = { templates: [] }

        currencyMap[currency].templates.push(scheduled);

      }

      return currencyMap;

    }

    /**
     * @param {Array} templates
     * @param {Integer} journal
     * @description
     * create a amortization schedule search when the input are used how filters of
     * the search.
     * Return an array when the propperties of each line is:
     * - template
     * - line : line sequence
     * - sourceAcc : Source Account
     * - destAcc : Destination Account
     * - realAmount : the amoritzation amount divided to exchange rate to transaction
     * @returns {Array}
     */
    function getLinesAmortizationScheduled(templates, journal) {

      let amortizationLines = [];
      search.create({
        type: 'amortizationschedule',
        filters: [
          ['internalid', 'anyof'].concat(templates), // * Audit: Util, concat
          'AND',
          ['journal.internalid', 'anyof', journal]
        ],
        columns: [
          { name: 'internalid' },
          { name: 'linesequencenumber' },
          { name: 'sourceacct' },
          { name: 'destacct' },
          {
            name: "formulanumeric",
            formula: "ROUND({recurfxamount}/{transaction.exchangerate},2)",
          },
          { name: 'class', join: 'transaction' },
          { name: 'department', join: 'transaction' },
          { name: 'location', join: 'transaction' },
          { name: 'tranid', join: 'transaction' }
        ]
      }).run().each(node => {

        let template = node.getValue(node.columns[0]);
        let line = node.getValue(node.columns[1]);
        let sourceAcc = node.getValue(node.columns[2]);
        let destAcc = node.getValue(node.columns[3]);
        let realAmount = Number(node.getValue(node.columns[4]));

        let _class = node.getValue(node.columns[5]);
        let _department = node.getValue(node.columns[6]);
        let _location = node.getValue(node.columns[7]);
        let tranid = node.getValue(node.columns[8]);

        amortizationLines.push({
          template, line, sourceAcc, destAcc, realAmount,
          class: _class,
          department: _department,
          location: _location,
          tranid: tranid
        })

        return true;
      })

      return amortizationLines;

    }

    /**
     * @param {Record} journalRecord
     * @param {Array} glLines
     * @param {Integer} currency
     * @param {Object} templateMap
     * @description
     * Create a new Journal with the input currenncy
     * For fill the main fields of the journal used the JournalRecord
     * TemplateMap has Lines information and it is used for validate each line
     * @returns {Integer} Journal ID
     */
    function createForeignJournal(journalRecord, glLines, currency, templateMap) {

      if (glLines.length == 0) return;

      let foreignJournalRecord = record.create({ type: 'journalentry', isDynamic: true });

      let journalInformation = generalInformation(journalRecord);

      foreignJournalRecord.setValue('customform', journalInformation.form);
      foreignJournalRecord.setValue('subsidiary', journalInformation.subsidiary);
      foreignJournalRecord.setValue('currency', currency);
      foreignJournalRecord.setValue('period', journalInformation.period);
      foreignJournalRecord.setValue('trandate', journalInformation.date);
      foreignJournalRecord.setValue('isfromamortization', true);

      glLines.forEach(currentGlLine => {

        let { template, line, sourceAcc, destAcc, realAmount, tranid } = currentGlLine;

        let aditionalAmount = 0;
        let lastLine = templateMap[template].maxLine;
        if (line == lastLine) {
          aditionalAmount = Number(templateMap[template].addtionalAmount);
        }
        let entity = templateMap[template].entity;

        let amount = (realAmount + aditionalAmount).toFixed(2);

        foreignJournalRecord.selectNewLine('line');
        foreignJournalRecord.setCurrentSublistValue('line', 'account', destAcc);
        foreignJournalRecord.setCurrentSublistValue('line', 'debit', amount);
        foreignJournalRecord.setCurrentSublistValue('line', 'entity', entity);
        foreignJournalRecord.setCurrentSublistValue('line', 'memo', 'Amortization Destination');
        foreignJournalRecord.setCurrentSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.tranIdTransaction, tranid, tranid);
        if (currentGlLine.department) {
          foreignJournalRecord.setCurrentSublistValue('line', 'department', currentGlLine.department);
        }
        if (currentGlLine.class) {
          foreignJournalRecord.setCurrentSublistValue('line', 'class', currentGlLine.class);
        }
        if (currentGlLine.location) {
          foreignJournalRecord.setCurrentSublistValue('line', 'location', currentGlLine.location);
        }
        foreignJournalRecord.commitLine('line');

        foreignJournalRecord.selectNewLine('line');
        foreignJournalRecord.setCurrentSublistValue('line', 'account', sourceAcc);
        foreignJournalRecord.setCurrentSublistValue('line', 'credit', amount);
        foreignJournalRecord.setCurrentSublistValue('line', 'entity', entity);
        foreignJournalRecord.setCurrentSublistValue('line', 'memo', 'Amortization Source');
        foreignJournalRecord.setCurrentSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.tranIdTransaction, tranid, tranid);
        if (currentGlLine.department) {
          foreignJournalRecord.setCurrentSublistValue('line', 'department', currentGlLine.department);
        }
        if (currentGlLine.class) {
          foreignJournalRecord.setCurrentSublistValue('line', 'class', currentGlLine.class);
        }
        if (currentGlLine.location) {
          foreignJournalRecord.setCurrentSublistValue('line', 'location', currentGlLine.location);
        }
        foreignJournalRecord.commitLine('line');

      });


      return foreignJournalRecord.save({ disableTriggers: true, ignoreMandatoryFields: true })

    }

    /**
     * @param {Record} journalRecord
     * @param {Record} reverseJournal
     * @param {Object} foreignJournalMap
     * @description
     * update the journal Record Line, in each line set the reversejournal and foreignjournal
     * how can there be more than 1 foreign journal, this information is foreignJournalMap
     */
    function joinNewJournalWithInputJournal(journalRecord, reverseJournal, foreignJournalMap) {

      let totalLines = journalRecord.getLineCount('line');

      let arrayTemplates = [];

      for (var i = 0; i < totalLines; i++) {
        let template = journalRecord.getSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.amortizationSchedule, i);
        if (template) {
          arrayTemplates.push(template);
        }
      }

      log.debug('Join.Templates', arrayTemplates);
      let templateTranidMap = {} // * Audit: Util

      search.create({
        type: 'amortizationschedule',
        columns: [
          { name: 'internalid', summary: 'GROUP' },
          { name: 'tranid', join: 'transaction', summary: 'GROUP' }
        ],
        filters: [
          ['internalid', 'anyof'].concat(arrayTemplates) // * Audit: Util, concat
        ]
      }).run().each(node => {
        let { columns } = node;
        templateTranidMap[node.getValue(columns[0])] = node.getValue(columns[1]);
        return true;
      })


      for (var i = 0; i < totalLines; i++) {

        let template = journalRecord.getSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.amortizationSchedule, i);
        let tranid = templateTranidMap[template];
        let foreignJournal = foreignJournalMap[template];

        if (foreignJournal) {
          journalRecord.setSublistValue({
            sublistId: 'line',
            fieldId: AMORTIZATION_JOURNAL_RECORD.columns.foreignJournal,
            line: i,
            value: foreignJournal
          });

          journalRecord.setSublistValue({
            sublistId: 'line',
            fieldId: AMORTIZATION_JOURNAL_RECORD.columns.reverseJournal,
            line: i,
            value: reverseJournal
          });

          journalRecord.setSublistValue({
            sublistId: 'line',
            fieldId: AMORTIZATION_JOURNAL_RECORD.columns.tranIdTransaction,
            line: i,
            value: tranid
          })
        }
      }
      journalRecord.setValue(AMORTIZATION_JOURNAL_RECORD.fields.foreignFlow, true);
      journalRecord.save({ disableTriggers: true, ignoreMandatoryFields: true })

    }
    /**
     * @param {Integer} journal Journal Record ID
     * @description
     * Execute the creation both Journal (Reverse and Foreign)
     */
    function executeForeignCurrencyFlow(journal) {

      var journalGeneratedArray = [];

      try {

        //Load Journal Record
        let journalRecord = record.load({ type: 'journalentry', id: journal });


        // Get the subdiairy and check if it has permission
        let subsidiary = journalRecord.getValue('subsidiary');

        if (!isFeatureEnabled(subsidiary)) {
          log.debug('JournalAmortization.Exception', 'Feature Disabled')
          return;
        }

        // Check if the Journal is of amortization
        if (!isAmortizationJournal(journalRecord)) {
          log.debug('JournalAmortization.Exception', 'The Journal is not from amortization Schedule')
          return;
        }

        // Get the amortization Scheduled list related to Journal
        let amortizationScheduledList = getAmortizationSchedules(journalRecord);

        if (amortizationScheduledList.length == 0) return

        // Get the transactions with foreign currency (Different to PEN)
        let amortizationScheduledForeignCurrencyList = getOnlyAmortizationWithForeignCurrency(amortizationScheduledList);

        if (Object.keys(amortizationScheduledForeignCurrencyList).length == 0) { // * Audit: Util, Object.keys
          log.debug('JournalAmortization.Exception', 'There are no amortization schedule with foreign currency')
          return
        }

        log.debug('Get Templates Configurations', amortizationScheduledForeignCurrencyList);

        // Create Reverse journal
        let reverseJournal = createReverseJournal(journalRecord, amortizationScheduledForeignCurrencyList);

        log.debug('Reverse Journal: ', reverseJournal)

        //Add Reverse Journal in the Journal Result Array
        journalGeneratedArray.push(reverseJournal);

        //get a map Object when the currency is the key value
        let amortizationScheduledGroupByCurrency = groupAmortizationByCurrency(amortizationScheduledForeignCurrencyList);
        log.debug('Currencies', amortizationScheduledGroupByCurrency);

        let templateJournalMap = {}; // * Audit: Util, manejo de JSON

        for (var currency in amortizationScheduledGroupByCurrency) { // * Audit: Util, for in

          let templates = amortizationScheduledGroupByCurrency[currency].templates;

          let glLines = getLinesAmortizationScheduled(templates, journal);

          log.debug(templates, glLines);

          // Create foreign Journal
          let foreignJournal = createForeignJournal(journalRecord, glLines, currency, amortizationScheduledForeignCurrencyList)

          log.debug('Foreign Journal', foreignJournal);

          journalGeneratedArray.push(foreignJournal);

          templates.forEach(template => {
            templateJournalMap[template] = foreignJournal;
          })

        }

        joinNewJournalWithInputJournal(journalRecord, reverseJournal, templateJournalMap);

      } catch (err) {

        log.error('executeForeignCurrencyFlow.error', err);
        log.debug('Start RollBack', journalGeneratedArray);
        journalGeneratedArray.forEach(journalId => {
          record.delete({ type: 'journalentry', id: journalId })
        })
        log.debug('End RollBack', '--------------------');

      }
    }

    /**
     * @param {Record} journalRecord
     * @description
     * Get the reverse Journal and the foreign Journals related to Journal Record and delete them
     * @returns
     */
    function deleteOthersJournals(journalRecord) {


      if (!isAmortizationJournal(journalRecord)) return;

      let journalMap = {}; // * Audit: Util, manejo de JSON

      let totalLines = journalRecord.getLineCount('line');

      for (var i = 0; i < totalLines; i++) {

        let foreignJournal = journalRecord.getSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.foreignJournal, i);

        if (foreignJournal) journalMap[foreignJournal] = true;

        let reverseJournal = journalRecord.getSublistValue('line', AMORTIZATION_JOURNAL_RECORD.columns.reverseJournal, i);

        if (reverseJournal) journalMap[reverseJournal] = true;

      }

      Object.keys(journalMap).forEach(journalId => {
        record.delete({ type: 'journalentry', id: journalId })
      })
    }

    /**
     *
     * @param {Integer} journalId
     * @description
     * Check if the journal have foreign currencies
     * @returns {Boolean}
     */
    function haveForeignCurrency(journalId) {

      let journalAmortizationSearchContext = {
        type: "amortizationschedule",
        filters:
          [
            ["journal.internalid", "anyof", journalId],
            "AND",
            ["formulatext: CASE WHEN {transaction.currency} = {currency} THEN 'E' ELSE 'D' END", "is", "D"]
          ],
        columns:
          [
            { name: 'internalid', join: 'journal', summary: 'GROUP' },
            { name: 'internalid', summary: 'COUNT' }
          ]
      }

      let length = search.create(journalAmortizationSearchContext).run().getRange(0, 1).length;

      return length > 0 ? true : false;
    }


    /*****************************************************************
       Main Functions
     *****************************************************************/

    /**
     * @param {Record/Integer} journalRecord
     * @param {String} mode
     * @description
     * Main Function, it is used for start flow, or for delete the relations
     */
    function executeForeignAction(journalRecord, mode) {


      if (mode == 'create') {
        executeForeignCurrencyFlow(journalRecord)
      }

      if (mode == 'delete') {
        deleteOthersJournals(journalRecord);
      }

    }

    /**
     * @description
     * Get The journal IDs pending to made the amortization foreign flow
     * @returns {Array}
     */
    function getAmortizationJournalList() {

      let journalList = [];

      let journalSearch = search.create({
        type: 'journalentry',
        columns: ['internalid'],
        filters: [
          ['mainline', 'is', 'T'],
          'AND',
          [AMORTIZATION_JOURNAL_RECORD.fields.foreignFlow, 'is', 'T']
        ]
      }).runPaged({ pageSize: 1000 });
      journalSearch.pageRanges.forEach((pageRange) => {
        let currentPage = journalSearch.fetch({ index: pageRange.index });
        currentPage.data.forEach((node) => {
          journalList.push(node.id);
        });
      });

      let journalAmortizationSearchContext = {
        type: "amortizationschedule",
        filters:
          [
            ["journal.internalid", "noneof", "@NONE@"],
            "AND",
            ["formulatext: CASE WHEN {transaction.currency} = {currency} THEN 'E' ELSE 'D' END", "is", "D"]
          ],
        columns:
          [
            { name: 'internalid', join: 'journal', summary: 'GROUP' },
            { name: 'internalid', summary: 'COUNT' }
          ]
      }

      if (journalList.length > 0) {
        journalAmortizationSearchContext.filters.push('AND');
        journalAmortizationSearchContext.filters.push(["journal.internalid", "noneof"].concat(journalList)); // * Audit: Util, concat
      }

      let resultSet = [];

      let amoritzationJournalSearch = search.create(journalAmortizationSearchContext).runPaged({ pageSize: 1000 })

      amoritzationJournalSearch.pageRanges.forEach((pageRange) => {
        let currentPage = amoritzationJournalSearch.fetch({ index: pageRange.index });
        currentPage.data.forEach((node) => {
          let journal = node.getValue(node.columns[0]);
          if (journal) {
            resultSet.push(journal)
          }
        });
      });

      return resultSet;
    }

    /**
     * @param {UserEventContext} context
     * @description
     * Manage the Journal Amortization Form. show messages and aditional function for User Interface
     * @returns
     */
    function manageForm(context) {

      if (runtime.executionContext != 'USERINTERFACE') return

      if (context.type != 'view') return

      let isAmortization = context.newRecord.getValue(AMORTIZATION_JOURNAL_RECORD.fields.isAmortization); // * Audit: isfromamortization, como supo que boton usar?

      if (isAmortization == 'F' || isAmortization == false) return;

      let subsidiary = context.newRecord.getValue('subsidiary');

      if (!isFeatureEnabled(subsidiary)) {
        log.debug('Amortization Feature Status', '-- Disabled --')
        return
      }

      if (context.type == 'view') {

        let foreignFlowExecuted = context.newRecord.getValue(AMORTIZATION_JOURNAL_RECORD.fields.foreignFlow); // * Audit: custbody_bm_foreign_ja_completed

        if (foreignFlowExecuted == true || foreignFlowExecuted == 'T') {

          context.form.addPageInitMessage({ // * Audit: Detiene el proceso
            type: 'INFO',
            message: 'La transacción ya tiene el flujo de amortizaciones para monedas extranjeras completado.',
            duration: 30000
          })
          return
        };

        if (haveForeignCurrency(context.newRecord.id)) {
          context.form.addButton({ // * Audit: Solo crea el boton en modo 'view'
            id: 'custpage_exeucte_foreign_flow',
            label: 'BM - Proceso de Amortization (Moneda Extranjera)',
            functionName: 'executeFlow()'
          })
        }
      }

      let request = context.request;

      if (!request) return;

      if (request.parameters && request.parameters['_foreign']) {
        let executeFlow = request.parameters['_foreign'];

        if (executeFlow == 'E') {

          executeForeignAction(context.newRecord.id, 'create');

          redirect.toRecord({
            id: context.newRecord.id,
            type: context.newRecord.type,
            isEditMode: false
          })

        }

      }
    }

    return {
      executeForeignAction,
      getAmortizationJournalList,
      manageForm
    }

  });
