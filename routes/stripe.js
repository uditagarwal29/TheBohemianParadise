const router = require("express").Router();
const stripe = require("stripe")(process.env.STRIPE_KEY);


router.post("/payment", (req,res)=>{
    stripe.charges.create({
        source:req.body.tokenId,
        amount: req.body.amount,
        currency:"inr",
    })
})

module.exports = router;