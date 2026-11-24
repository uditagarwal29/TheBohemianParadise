const { BaseRepository } = require("../../shared/kernel/repository");
const Cart = require("./cart.model");

class CartRepository extends BaseRepository {
  constructor() {
    super(Cart);
  }
  async forUser(userId) {
    return (await this.findOne({ userId })) || (await this.create({ userId, items: [] }));
  }
  clearForUser(userId) {
    return this.updateOne({ userId }, { $set: { items: [] } });
  }
}

module.exports = { CartRepository };
