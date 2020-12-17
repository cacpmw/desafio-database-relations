import { inject, injectable } from 'tsyringe';

import AppError from '@shared/errors/AppError';

import IProductsRepository from '@modules/products/repositories/IProductsRepository';
import ICustomersRepository from '@modules/customers/repositories/ICustomersRepository';
import Order from '../infra/typeorm/entities/Order';
import IOrdersRepository from '../repositories/IOrdersRepository';

interface IProduct {
  id: string;
  quantity: number;
}

interface IRequest {
  customer_id: string;
  products: IProduct[];
}

@injectable()
class CreateOrderService {
  constructor(
    @inject('OrdersRepository')
    private ordersRepository: IOrdersRepository,
    @inject('ProductsRepository')
    private productsRepository: IProductsRepository,
    @inject('CustomersRepository')
    private customersRepository: ICustomersRepository,
  ) {}

  public async execute({ customer_id, products }: IRequest): Promise<Order> {
    const customer = await this.customersRepository.findById(customer_id);
    if (!customer) {
      throw new AppError('Customer not found', 400);
    }
    const foundProducts = await this.productsRepository.findAllById(products);
    if (!foundProducts.length) {
      throw new AppError('Products not found', 400);
    }

    const existingProductsIds = foundProducts.map(product => product.id);
    const missingProductsIds = products.filter(
      product => !existingProductsIds.includes(product.id),
    );
    if (missingProductsIds.length > 0) {
      throw new AppError('Some products were not found', 404);
    }
    const productsWithNoQuantityAvailable = products.filter(
      (product, index) =>
        foundProducts.filter(foundProduct => foundProduct.id === product.id)[
          index
        ].quantity < product.quantity,
    );
    if (productsWithNoQuantityAvailable.length > 0) {
      throw new AppError('Some products are not available at the moment', 400);
    }
    const formattedProducts = products.map((product, index) => ({
      product_id: product.id,
      quantity: product.quantity,
      price: foundProducts.filter(
        foundProduct => foundProduct.id === product.id,
      )[index].price,
    }));
    const order = await this.ordersRepository.create({
      customer,
      products: formattedProducts,
    });

    const { order_products } = order;
    const orderProductsQuantity = order_products.map((product, index) => ({
      id: product.product_id,
      quantity:
        foundProducts.filter(
          foundProduct => foundProduct.id === product.product_id,
        )[index].quantity - product.quantity,
    }));
    await this.productsRepository.updateQuantity(orderProductsQuantity);
    return order;
  }
}

export default CreateOrderService;
