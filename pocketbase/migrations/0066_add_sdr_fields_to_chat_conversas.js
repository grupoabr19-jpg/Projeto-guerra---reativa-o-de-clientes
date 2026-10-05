/// <reference path="../pb_data/types.d.ts" />

/**
 * 0066_add_sdr_fields_to_chat_conversas.js
 *
 * Adiciona os campos:
 * - status_sdr (select: 'novo_lead', 'transferido', 're_superficie')
 * - transferido_em (date)
 * e índices correspondentes na coleção chat_conversas.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('chat_conversas')

    if (!col.fields.getByName('status_sdr')) {
      col.fields.add(
        new SelectField({
          name: 'status_sdr',
          values: ['novo_lead', 'transferido', 're_superficie'],
          maxSelect: 1,
        }),
      )
    }

    if (!col.fields.getByName('transferido_em')) {
      col.fields.add(
        new DateField({
          name: 'transferido_em',
        }),
      )
    }

    col.addIndex('idx_chat_conv_status_sdr', false, 'status_sdr', '')
    col.addIndex('idx_chat_conv_responsavel', false, 'responsavel_id', '')

    app.save(col)
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('chat_conversas')
      col.removeIndex('idx_chat_conv_status_sdr')
      col.removeIndex('idx_chat_conv_responsavel')
      if (col.fields.getByName('status_sdr')) {
        col.fields.removeByName('status_sdr')
      }
      if (col.fields.getByName('transferido_em')) {
        col.fields.removeByName('transferido_em')
      }
      app.save(col)
    } catch (_) {}
  },
)
