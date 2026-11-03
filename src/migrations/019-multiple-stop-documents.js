import {DataTypes as D} from 'sequelize';
export const name='019-multiple-stop-documents';
export const multipleDocumentFields={arrival_file_ids:{type:D.JSONB,allowNull:false,defaultValue:[]}};
export async function up({context:db}){await db.transaction(async transaction=>{
 await db.getQueryInterface().addColumn('trip_stops','arrival_file_ids',multipleDocumentFields.arrival_file_ids,{transaction});
 await db.query("UPDATE trip_stops SET arrival_file_ids=jsonb_build_array(arrival_file_id::text) WHERE arrival_file_id IS NOT NULL",{transaction});
});}
export async function down(){throw Error('Restaure respaldo para revertir.');}
