import {DataTypes as D,literal} from 'sequelize';
export const name='015-single-stop-document';
export const singleStopFields={outside_at:{type:D.DATE},exit_state:{type:D.STRING(20)},exit_reason:{type:D.TEXT},exit_history:{type:D.JSONB,allowNull:false,defaultValue:[]},reminded_at:{type:D.DATE}};
export async function up({context:db}){await db.transaction(async transaction=>{
 const q=db.getQueryInterface();for(const [name,field] of Object.entries(singleStopFields))await q.addColumn('trip_stops',name,field,{transaction});
 // Keep old departure evidence; only fill absent canonical point values.
 await db.query('UPDATE trip_stops SET arrival_file_id=COALESCE(arrival_file_id,departure_file_id), arrival_odometer=COALESCE(arrival_odometer,departure_odometer)',{transaction});
 await db.query("UPDATE operational_notifications SET read_at=CURRENT_TIMESTAMP WHERE phase='departure' AND read_at IS NULL",{transaction});
});}
export async function down(){throw Error('Restaure respaldo para revertir.');}
