const pick=(row,keys)=>Object.fromEntries(keys.filter(k=>row?.[k]!==undefined).map(k=>[k,row[k]]));
export const isAdmin=user=>user.role==='admin';
export function visibleTrip(row,user){
 const trip=row?.toJSON?.()??row;
 if(isAdmin(user))return trip;
 const result=pick(trip,['id','code','driver_id','vehicle_id','status','origin','destination','created_at','started_at','closed_at','is_test','test_clock','tonnage','operation_status','plate','driver','expenses','control_revision']);
 if(trip.metadata)result.metadata=pick(trip.metadata,['route','origin_place','destination_places','capacity_warning','calculation']);
 return result;
}
