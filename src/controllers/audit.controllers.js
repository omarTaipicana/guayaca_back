import { Audit, User, wrap } from "../services/shared.service.js";
export const auditGet = wrap(async (req, res) => {
  let rows = await Audit.findAll({
    include: [
      {
        model: User,
        as: "actor",
        attributes: ["name", "email"],
        required: false,
      },
    ],
    order: [["id", "DESC"]],
    limit: 300,
  });
  res.json(
    rows.map((x) => {
      let a = x.get({ plain: true });
      return {
        id: a.id,
        action: a.action,
        details: a.details,
        created_at: a.created_at,
        name: a.actor?.name || null,
        email: a.actor?.email || null,
      };
    }),
  );
});
